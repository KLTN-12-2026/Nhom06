import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { writeAuditLog } from '../../common/utils/audit-log.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  classifyExpirySeverity,
  ExpirySeverity,
  formatOverridesSummary,
  MissingGlobalThresholdError,
  OverrideSummaryInput,
  selectApplicableThreshold,
  sortExpiryAlerts,
  ThresholdRecord,
  ThresholdScope,
} from './domain/expiry-policy';
import { diffCalendarDays, formatDateOnly, parseIsoDateStrict } from './domain/vn-date';
import { ListExpiryAlertsQueryDto } from './dto/expiry-alert.dto';
import { ExpiryThresholdsService } from './expiry-thresholds.service';

export interface ExpiryAlertItemResponse {
  lot: {
    id: string;
    lotCode: string;
    status: string;
  };
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
    group: {
      id: string;
      code: string;
      name: string;
    };
  };
  expiryDate: string;
  daysRemaining: number;
  onHandQty: string;
  severity: Exclude<ExpirySeverity, 'normal'>;
  thresholdApplied: {
    id: string;
    scope: ThresholdScope;
    warningDays: number;
    criticalDays: number;
  };
}

export interface ExpiryAlertsListResponse {
  evaluationDate: string;
  items: ExpiryAlertItemResponse[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ExpiryAlertsSummaryResponse {
  evaluationDate: string;
  expired: {
    lots: number;
    qty: string;
  };
  nearExpiry: {
    lots: number;
    qty: string;
  };
  totalAlertLots: number;
  global: {
    warningDays: number;
    criticalDays: number;
    minDeliveryDays: number;
  };
  overridesSummary: string;
}

export interface EvaluateExpiryAlertsResponse {
  evaluationDate: string;
  evaluatedLots: number;
  expiredLots: number;
  criticalLots: number;
  warningLots: number;
}

interface ComputedAlertRow {
  item: ExpiryAlertItemResponse;
  onHandDecimal: Prisma.Decimal;
}

interface ComputedEvaluationResult {
  evaluationDate: string;
  evaluationDateObj: Date;
  alerts: ComputedAlertRow[];
  global: {
    warningDays: number;
    criticalDays: number;
    minDeliveryDays: number;
  };
  overridesSummary: string;
}

function parseOptionalFilterDate(raw: string | undefined, field: string): string | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    return formatDateOnly(parseIsoDateStrict(raw));
  } catch {
    throw new BadRequestException({
      message: 'Ngày lọc không hợp lệ',
      errors: [{ field, message: 'Ngày phải đúng định dạng YYYY-MM-DD' }],
    });
  }
}

@Injectable()
export class ExpiryAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly thresholdsService: ExpiryThresholdsService,
  ) {}

  private async computeForDate(date?: string): Promise<ComputedEvaluationResult> {
    const { dateStr, dateObj } = this.thresholdsService.resolveEvaluationDate(date);

    const [thresholdRows, balanceRows] = await Promise.all([
      this.thresholdsService.loadEffectiveRowsAtDate(dateObj),
      this.prisma.inventoryLotBalance.findMany({
        where: {
          onHandQty: { gt: new Prisma.Decimal(0) },
        },
        select: {
          onHandQty: true,
          lot: {
            select: {
              id: true,
              lotCode: true,
              expiryDate: true,
              status: true,
              product: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  unit: true,
                  groupId: true,
                  group: {
                    select: {
                      id: true,
                      code: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const domainThresholds: ThresholdRecord[] = thresholdRows.map((row) => ({
      id: row.id,
      scope: row.scope as ThresholdScope,
      productGroupId: row.productGroupId,
      productId: row.productId,
      warningDays: row.warningDays,
      criticalDays: row.criticalDays,
      minDeliveryDays: row.minDeliveryDays,
      effectiveFrom: formatDateOnly(row.effectiveFrom),
      effectiveTo: row.effectiveTo ? formatDateOnly(row.effectiveTo) : null,
    }));

    const globalRow = thresholdRows.find((r) => r.scope === 'GLOBAL');
    if (!globalRow) {
      throw new InternalServerErrorException(new MissingGlobalThresholdError(dateStr).message);
    }

    const overrideInputs: OverrideSummaryInput[] = [];
    const seenTargets = new Set<string>();
    for (const row of thresholdRows) {
      if (row.scope === 'PRODUCT' && row.product) {
        const key = `PRODUCT:${row.product.id}`;
        if (!seenTargets.has(key)) {
          seenTargets.add(key);
          overrideInputs.push({
            scope: 'PRODUCT',
            targetCode: row.product.code,
            targetName: row.product.name,
            warningDays: row.warningDays,
          });
        }
      } else if (row.scope === 'PRODUCT_GROUP' && row.productGroup) {
        const key = `PRODUCT_GROUP:${row.productGroup.id}`;
        if (!seenTargets.has(key)) {
          seenTargets.add(key);
          overrideInputs.push({
            scope: 'PRODUCT_GROUP',
            targetCode: row.productGroup.code,
            targetName: row.productGroup.name,
            warningDays: row.warningDays,
          });
        }
      }
    }

    const computed: ComputedAlertRow[] = [];
    for (const balance of balanceRows) {
      const { lot } = balance;
      const expiryDateStr = formatDateOnly(lot.expiryDate);
      const daysRemaining = diffCalendarDays(expiryDateStr, dateStr);

      let resolved;
      try {
        resolved = selectApplicableThreshold(
          domainThresholds,
          lot.product.id,
          lot.product.groupId,
          dateStr,
        );
      } catch (error) {
        if (error instanceof MissingGlobalThresholdError) {
          throw new InternalServerErrorException(error.message);
        }
        throw error;
      }

      const severity = classifyExpirySeverity(
        daysRemaining,
        resolved.warningDays,
        resolved.criticalDays,
      );
      if (severity === 'normal') {
        continue;
      }

      computed.push({
        onHandDecimal: balance.onHandQty,
        item: {
          lot: {
            id: lot.id,
            lotCode: lot.lotCode,
            status: lot.status,
          },
          product: {
            id: lot.product.id,
            code: lot.product.code,
            name: lot.product.name,
            unit: lot.product.unit,
            group: lot.product.group,
          },
          expiryDate: expiryDateStr,
          daysRemaining,
          onHandQty: balance.onHandQty.toString(),
          severity,
          thresholdApplied: {
            id: resolved.thresholdId,
            scope: resolved.scope,
            warningDays: resolved.warningDays,
            criticalDays: resolved.criticalDays,
          },
        },
      });
    }

    const sorted = sortExpiryAlerts(
      computed.map((entry) => ({
        daysRemaining: entry.item.daysRemaining,
        lotCode: entry.item.lot.lotCode,
        entry,
      })),
    ).map((wrapped) => wrapped.entry);

    return {
      evaluationDate: dateStr,
      evaluationDateObj: dateObj,
      alerts: sorted,
      global: {
        warningDays: globalRow.warningDays,
        criticalDays: globalRow.criticalDays,
        minDeliveryDays: globalRow.minDeliveryDays ?? 0,
      },
      overridesSummary: formatOverridesSummary(overrideInputs),
    };
  }

  async list(query: ListExpiryAlertsQueryDto): Promise<ExpiryAlertsListResponse> {
    const expiryFrom = parseOptionalFilterDate(query.expiryFrom, 'expiryFrom');
    const expiryTo = parseOptionalFilterDate(query.expiryTo, 'expiryTo');

    if (expiryFrom && expiryTo && expiryFrom > expiryTo) {
      throw new BadRequestException({
        message: 'Ngày bắt đầu khoảng HSD không được lớn hơn ngày kết thúc',
        errors: [
          {
            field: 'expiryFrom',
            message: 'Ngày bắt đầu khoảng HSD không được lớn hơn ngày kết thúc',
          },
        ],
      });
    }

    const computed = await this.computeForDate(query.date);
    const searchLower = query.search ? query.search.trim().toLowerCase() : '';

    const filtered = computed.alerts
      .map((row) => row.item)
      .filter((item) => {
        if (query.severity && item.severity !== query.severity) {
          return false;
        }
        if (query.productId && item.product.id !== query.productId) {
          return false;
        }
        if (expiryFrom && item.expiryDate < expiryFrom) {
          return false;
        }
        if (expiryTo && item.expiryDate > expiryTo) {
          return false;
        }
        if (
          query.maxDaysRemaining !== undefined &&
          item.daysRemaining > query.maxDaysRemaining
        ) {
          return false;
        }
        if (searchLower.length > 0) {
          const matchesLot = item.lot.lotCode.toLowerCase().includes(searchLower);
          const matchesProductCode = item.product.code.toLowerCase().includes(searchLower);
          const matchesProductName = item.product.name.toLowerCase().includes(searchLower);
          if (!matchesLot && !matchesProductCode && !matchesProductName) {
            return false;
          }
        }
        return true;
      });

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const start = (page - 1) * pageSize;

    return {
      evaluationDate: computed.evaluationDate,
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  async summary(date?: string): Promise<ExpiryAlertsSummaryResponse> {
    const computed = await this.computeForDate(date);

    let expiredLots = 0;
    let expiredQty = new Prisma.Decimal(0);
    let nearExpiryLots = 0;
    let nearExpiryQty = new Prisma.Decimal(0);

    for (const row of computed.alerts) {
      if (row.item.severity === 'expired') {
        expiredLots += 1;
        expiredQty = expiredQty.plus(row.onHandDecimal);
      } else {
        nearExpiryLots += 1;
        nearExpiryQty = nearExpiryQty.plus(row.onHandDecimal);
      }
    }

    return {
      evaluationDate: computed.evaluationDate,
      expired: {
        lots: expiredLots,
        qty: expiredQty.toString(),
      },
      nearExpiry: {
        lots: nearExpiryLots,
        qty: nearExpiryQty.toString(),
      },
      totalAlertLots: expiredLots + nearExpiryLots,
      global: computed.global,
      overridesSummary: computed.overridesSummary,
    };
  }

  /**
   * Ghi snapshot cảnh báo vào bảng `expiry_alerts` cho `(lot_id, evaluation_date)`.
   * Idempotent khi chạy nhiều lần cùng ngày; tuyệt đối không thay đổi tồn kho hay tạo `stock_movements`.
   */
  async evaluate(
    date?: string,
    actorUserId: string | null = null,
    trigger: 'MANUAL' | 'SCHEDULED' = 'MANUAL',
  ): Promise<EvaluateExpiryAlertsResponse> {
    const computed = await this.computeForDate(date);

    let expiredLots = 0;
    let criticalLots = 0;
    let warningLots = 0;
    const activeLotIds: string[] = [];

    for (const row of computed.alerts) {
      activeLotIds.push(row.item.lot.id);
      if (row.item.severity === 'expired') {
        expiredLots += 1;
      } else if (row.item.severity === 'critical') {
        criticalLots += 1;
      } else {
        warningLots += 1;
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const row of computed.alerts) {
        await tx.expiryAlert.upsert({
          where: {
            lotId_evaluationDate: {
              lotId: row.item.lot.id,
              evaluationDate: computed.evaluationDateObj,
            },
          },
          create: {
            lotId: row.item.lot.id,
            thresholdId: row.item.thresholdApplied.id,
            evaluationDate: computed.evaluationDateObj,
            daysRemaining: row.item.daysRemaining,
            severity: row.item.severity,
            onHandQty: row.onHandDecimal,
            status: 'open',
          },
          update: {
            thresholdId: row.item.thresholdApplied.id,
            daysRemaining: row.item.daysRemaining,
            severity: row.item.severity,
            onHandQty: row.onHandDecimal,
            status: 'open',
          },
        });
      }

      // Đóng các cảnh báo cũ trong cùng ngày nếu lô đã hết tồn hoặc không còn cận hạn (không xóa vật lý)
      await tx.expiryAlert.updateMany({
        where: {
          evaluationDate: computed.evaluationDateObj,
          status: 'open',
          ...(activeLotIds.length > 0 ? { lotId: { notIn: activeLotIds } } : {}),
        },
        data: { status: 'closed' },
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'EXPIRY_ALERTS_EVALUATED',
        entityType: 'expiry_alert',
        entityId: computed.evaluationDate,
        newData: {
          evaluationDate: computed.evaluationDate,
          trigger,
          evaluatedLots: computed.alerts.length,
          expiredLots,
          criticalLots,
          warningLots,
        },
      });
    });

    return {
      evaluationDate: computed.evaluationDate,
      evaluatedLots: computed.alerts.length,
      expiredLots,
      criticalLots,
      warningLots,
    };
  }
}
