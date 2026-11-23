import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { writeAuditLog } from '../../common/utils/audit-log.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MissingGlobalThresholdError,
  ResolvedThreshold,
  selectApplicableThreshold,
  ThresholdRecord,
  ThresholdScope,
} from './domain/expiry-policy';
import { formatDateOnly, getVnTodayDateString, parseIsoDateStrict } from './domain/vn-date';
import {
  CreateOverrideThresholdDto,
  ThresholdHistoryQueryDto,
  UpdateGlobalThresholdDto,
  UpdateOverrideThresholdDto,
} from './dto/expiry-threshold.dto';

export interface GlobalThresholdResponse {
  id: string;
  warningDays: number;
  criticalDays: number;
  minDeliveryDays: number;
  effectiveFrom: string;
}

export interface OverrideThresholdResponse {
  id: string;
  scope: 'PRODUCT' | 'PRODUCT_GROUP';
  target: {
    id: string;
    code?: string;
    name: string;
  };
  warningDays: number;
  effectiveFrom: string;
}

export interface ActiveThresholdsResponse {
  global: GlobalThresholdResponse;
  overrides: OverrideThresholdResponse[];
}

export interface ThresholdHistoryItemResponse {
  id: string;
  scope: ThresholdScope;
  target: {
    id: string;
    code?: string;
    name: string;
  } | null;
  warningDays: number;
  criticalDays: number;
  minDeliveryDays: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  createdBy: {
    id: string;
    fullName: string;
  };
}

export interface ThresholdHistoryResponse {
  items: ThresholdHistoryItemResponse[];
}

const THRESHOLD_SELECT = {
  id: true,
  scope: true,
  productGroupId: true,
  productId: true,
  warningDays: true,
  criticalDays: true,
  minDeliveryDays: true,
  effectiveFrom: true,
  effectiveTo: true,
  createdAt: true,
  productGroup: {
    select: { id: true, code: true, name: true },
  },
  product: {
    select: { id: true, code: true, name: true },
  },
  creator: {
    select: { id: true, fullName: true },
  },
} satisfies Prisma.ExpiryThresholdSelect;

type ThresholdRow = Prisma.ExpiryThresholdGetPayload<{ select: typeof THRESHOLD_SELECT }>;

function toDomainThreshold(row: ThresholdRow): ThresholdRecord {
  return {
    id: row.id,
    scope: row.scope as ThresholdScope,
    productGroupId: row.productGroupId,
    productId: row.productId,
    warningDays: row.warningDays,
    criticalDays: row.criticalDays,
    minDeliveryDays: row.minDeliveryDays,
    effectiveFrom: formatDateOnly(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? formatDateOnly(row.effectiveTo) : null,
  };
}

function toOverrideResponse(row: ThresholdRow): OverrideThresholdResponse {
  if (row.scope === 'PRODUCT' && row.product) {
    return {
      id: row.id,
      scope: 'PRODUCT',
      target: {
        id: row.product.id,
        code: row.product.code,
        name: row.product.name,
      },
      warningDays: row.warningDays,
      effectiveFrom: formatDateOnly(row.effectiveFrom),
    };
  }
  if (row.scope === 'PRODUCT_GROUP' && row.productGroup) {
    return {
      id: row.id,
      scope: 'PRODUCT_GROUP',
      target: {
        id: row.productGroup.id,
        code: row.productGroup.code,
        name: row.productGroup.name,
      },
      warningDays: row.warningDays,
      effectiveFrom: formatDateOnly(row.effectiveFrom),
    };
  }
  throw new InternalServerErrorException('Dữ liệu ngưỡng riêng không nhất quán');
}

function toGlobalResponse(row: ThresholdRow): GlobalThresholdResponse {
  return {
    id: row.id,
    warningDays: row.warningDays,
    criticalDays: row.criticalDays,
    minDeliveryDays: row.minDeliveryDays ?? 0,
    effectiveFrom: formatDateOnly(row.effectiveFrom),
  };
}

function toHistoryItem(row: ThresholdRow): ThresholdHistoryItemResponse {
  let target: ThresholdHistoryItemResponse['target'] = null;
  if (row.scope === 'PRODUCT' && row.product) {
    target = { id: row.product.id, code: row.product.code, name: row.product.name };
  } else if (row.scope === 'PRODUCT_GROUP' && row.productGroup) {
    target = { id: row.productGroup.id, code: row.productGroup.code, name: row.productGroup.name };
  }

  return {
    id: row.id,
    scope: row.scope as ThresholdScope,
    target,
    warningDays: row.warningDays,
    criticalDays: row.criticalDays,
    minDeliveryDays: row.minDeliveryDays,
    effectiveFrom: formatDateOnly(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? formatDateOnly(row.effectiveTo) : null,
    createdAt: row.createdAt.toISOString(),
    createdBy: {
      id: row.creator.id,
      fullName: row.creator.fullName,
    },
  };
}

@Injectable()
export class ExpiryThresholdsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Chuẩn hóa tham số ngày đánh giá về cặp (YYYY-MM-DD, UTC midnight Date).
   * Mặc định lấy hôm nay theo múi giờ Asia/Ho_Chi_Minh.
   */
  resolveEvaluationDate(date?: string | Date): { dateStr: string; dateObj: Date } {
    if (date === undefined) {
      const dateStr = getVnTodayDateString();
      return { dateStr, dateObj: parseIsoDateStrict(dateStr) };
    }

    const rawStr = date instanceof Date ? formatDateOnly(date) : date;
    try {
      const dateObj = parseIsoDateStrict(rawStr);
      return { dateStr: formatDateOnly(dateObj), dateObj };
    } catch {
      throw new BadRequestException({
        message: 'Ngày đánh giá không hợp lệ',
        errors: [{ field: 'date', message: 'Ngày đánh giá phải đúng định dạng YYYY-MM-DD' }],
      });
    }
  }

  /**
   * Nạp toàn bộ ngưỡng đang hiệu lực tại `dateObj` theo khoảng nửa mở [effective_from, effective_to).
   */
  async loadEffectiveRowsAtDate(dateObj: Date): Promise<ThresholdRow[]> {
    return this.prisma.expiryThreshold.findMany({
      where: {
        effectiveFrom: { lte: dateObj },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: dateObj } }],
      },
      select: THRESHOLD_SELECT,
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Hàm dùng chung xuất khẩu cho FEFO (T-009) và phân tích rủi ro (T-013):
   * chọn ngưỡng áp dụng theo ưu tiên PRODUCT > PRODUCT_GROUP > GLOBAL tại ngày `date`.
   */
  async resolveThreshold(productId: string, date?: string | Date): Promise<ResolvedThreshold> {
    const { dateStr, dateObj } = this.resolveEvaluationDate(date);
    const [product, rows] = await Promise.all([
      this.prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, groupId: true },
      }),
      this.loadEffectiveRowsAtDate(dateObj),
    ]);

    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    try {
      return selectApplicableThreshold(
        rows.map(toDomainThreshold),
        product.id,
        product.groupId,
        dateStr,
      );
    } catch (error) {
      if (error instanceof MissingGlobalThresholdError) {
        throw new InternalServerErrorException(error.message);
      }
      throw error;
    }
  }

  /**
   * Hàm dùng chung xuất khẩu cho FEFO (T-009): lấy `min_delivery_days` của ngưỡng GLOBAL hiệu lực tại `date`.
   */
  async getMinDeliveryDays(date?: string | Date): Promise<number> {
    const { dateStr, dateObj } = this.resolveEvaluationDate(date);
    const globalRow = await this.prisma.expiryThreshold.findFirst({
      where: {
        scope: 'GLOBAL',
        effectiveFrom: { lte: dateObj },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: dateObj } }],
      },
      select: { minDeliveryDays: true },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });

    if (!globalRow) {
      throw new InternalServerErrorException(new MissingGlobalThresholdError(dateStr).message);
    }

    return globalRow.minDeliveryDays ?? 0;
  }

  async getActiveThresholds(): Promise<ActiveThresholdsResponse> {
    const activeRows = await this.prisma.expiryThreshold.findMany({
      where: { effectiveTo: null },
      select: THRESHOLD_SELECT,
      orderBy: [{ createdAt: 'asc' }],
    });

    const globalRow = activeRows.find((r) => r.scope === 'GLOBAL');
    if (!globalRow) {
      throw new InternalServerErrorException(new MissingGlobalThresholdError().message);
    }

    const overrides = activeRows
      .filter((r) => r.scope === 'PRODUCT' || r.scope === 'PRODUCT_GROUP')
      .map(toOverrideResponse)
      .sort((a, b) => {
        if (a.scope !== b.scope) {
          return a.scope === 'PRODUCT' ? -1 : 1;
        }
        return (a.target.code ?? a.target.name).localeCompare(b.target.code ?? b.target.name, 'vi');
      });

    return {
      global: toGlobalResponse(globalRow),
      overrides,
    };
  }

  async updateGlobal(
    dto: UpdateGlobalThresholdDto,
    actorUserId: string,
  ): Promise<GlobalThresholdResponse> {
    if (dto.criticalDays > dto.warningDays) {
      throw new BadRequestException({
        message: 'Số ngày nguy cấp không được lớn hơn số ngày cảnh báo cận hạn',
        errors: [
          {
            field: 'criticalDays',
            message: 'Số ngày nguy cấp không được lớn hơn số ngày cảnh báo cận hạn',
          },
        ],
      });
    }

    const todayStr = getVnTodayDateString();
    const todayDate = parseIsoDateStrict(todayStr);

    const created = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.expiryThreshold.findFirst({
        where: { scope: 'GLOBAL', effectiveTo: null },
        select: THRESHOLD_SELECT,
      });

      if (existing) {
        const closeDate = existing.effectiveFrom > todayDate ? existing.effectiveFrom : todayDate;
        await tx.expiryThreshold.update({
          where: { id: existing.id },
          data: { effectiveTo: closeDate },
        });
      }

      const next = await tx.expiryThreshold.create({
        data: {
          scope: 'GLOBAL',
          productGroupId: null,
          productId: null,
          warningDays: dto.warningDays,
          criticalDays: dto.criticalDays,
          minDeliveryDays: dto.minDeliveryDays,
          effectiveFrom: todayDate,
          effectiveTo: null,
          createdBy: actorUserId,
        },
        select: THRESHOLD_SELECT,
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'EXPIRY_THRESHOLD_GLOBAL_UPDATED',
        entityType: 'expiry_threshold',
        entityId: next.id,
        oldData: existing
          ? {
              id: existing.id,
              warningDays: existing.warningDays,
              criticalDays: existing.criticalDays,
              minDeliveryDays: existing.minDeliveryDays,
              effectiveFrom: formatDateOnly(existing.effectiveFrom),
              effectiveTo: todayStr,
            }
          : null,
        newData: {
          id: next.id,
          scope: next.scope,
          warningDays: next.warningDays,
          criticalDays: next.criticalDays,
          minDeliveryDays: next.minDeliveryDays,
          effectiveFrom: formatDateOnly(next.effectiveFrom),
        },
      });

      return next;
    });

    return toGlobalResponse(created);
  }

  async createOverride(
    dto: CreateOverrideThresholdDto,
    actorUserId: string,
  ): Promise<OverrideThresholdResponse> {
    if (dto.scope === 'PRODUCT') {
      const product = await this.prisma.product.findUnique({
        where: { id: dto.targetId },
        select: { id: true, status: true },
      });
      if (!product || product.status !== 'active') {
        throw new BadRequestException({
          message: 'Sản phẩm không tồn tại hoặc đã ngừng kinh doanh',
          errors: [{ field: 'targetId', message: 'Sản phẩm không tồn tại hoặc đã ngừng kinh doanh' }],
        });
      }
    } else {
      const group = await this.prisma.productGroup.findUnique({
        where: { id: dto.targetId },
        select: { id: true, status: true },
      });
      if (!group || group.status !== 'active') {
        throw new BadRequestException({
          message: 'Nhóm hàng không tồn tại hoặc đã ngừng hoạt động',
          errors: [
            { field: 'targetId', message: 'Nhóm hàng không tồn tại hoặc đã ngừng hoạt động' },
          ],
        });
      }
    }

    const existingActive = await this.prisma.expiryThreshold.findFirst({
      where: {
        scope: dto.scope,
        effectiveTo: null,
        ...(dto.scope === 'PRODUCT'
          ? { productId: dto.targetId }
          : { productGroupId: dto.targetId }),
      },
      select: { id: true },
    });

    if (existingActive) {
      throw new ConflictException({
        message: 'Đối tượng này đã có ngưỡng cảnh báo đang hiệu lực, vui lòng dùng thao tác sửa',
        errors: [
          {
            field: 'targetId',
            message: 'Đối tượng này đã có ngưỡng cảnh báo đang hiệu lực',
          },
        ],
      });
    }

    const todayStr = getVnTodayDateString();
    const todayDate = parseIsoDateStrict(todayStr);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const next = await tx.expiryThreshold.create({
          data: {
            scope: dto.scope,
            productId: dto.scope === 'PRODUCT' ? dto.targetId : null,
            productGroupId: dto.scope === 'PRODUCT_GROUP' ? dto.targetId : null,
            warningDays: dto.warningDays,
            criticalDays: 0,
            minDeliveryDays: null,
            effectiveFrom: todayDate,
            effectiveTo: null,
            createdBy: actorUserId,
          },
          select: THRESHOLD_SELECT,
        });

        await writeAuditLog(tx, {
          actorUserId,
          eventType: 'EXPIRY_THRESHOLD_OVERRIDE_CREATED',
          entityType: 'expiry_threshold',
          entityId: next.id,
          newData: {
            scope: next.scope,
            targetId: dto.targetId,
            warningDays: next.warningDays,
            effectiveFrom: formatDateOnly(next.effectiveFrom),
          },
        });

        return next;
      });

      return toOverrideResponse(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          message: 'Đối tượng này đã có ngưỡng cảnh báo đang hiệu lực, vui lòng dùng thao tác sửa',
          errors: [
            {
              field: 'targetId',
              message: 'Đối tượng này đã có ngưỡng cảnh báo đang hiệu lực',
            },
          ],
        });
      }
      throw error;
    }
  }

  async updateOverride(
    id: string,
    dto: UpdateOverrideThresholdDto,
    actorUserId: string,
  ): Promise<OverrideThresholdResponse> {
    const existing = await this.prisma.expiryThreshold.findUnique({
      where: { id },
      select: THRESHOLD_SELECT,
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy ngưỡng cảnh báo');
    }
    if (existing.scope === 'GLOBAL') {
      throw new BadRequestException('Không thể sửa ngưỡng chung qua đường dẫn ngưỡng riêng');
    }
    if (existing.effectiveTo !== null) {
      throw new ConflictException('Ngưỡng cảnh báo này đã kết thúc hiệu lực');
    }

    const todayStr = getVnTodayDateString();
    const todayDate = parseIsoDateStrict(todayStr);
    const closeDate = existing.effectiveFrom > todayDate ? existing.effectiveFrom : todayDate;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.expiryThreshold.update({
        where: { id: existing.id },
        data: { effectiveTo: closeDate },
      });

      const next = await tx.expiryThreshold.create({
        data: {
          scope: existing.scope,
          productId: existing.productId,
          productGroupId: existing.productGroupId,
          warningDays: dto.warningDays,
          criticalDays: 0,
          minDeliveryDays: null,
          effectiveFrom: todayDate,
          effectiveTo: null,
          createdBy: actorUserId,
        },
        select: THRESHOLD_SELECT,
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'EXPIRY_THRESHOLD_OVERRIDE_UPDATED',
        entityType: 'expiry_threshold',
        entityId: next.id,
        oldData: {
          id: existing.id,
          scope: existing.scope,
          targetId: existing.productId ?? existing.productGroupId,
          warningDays: existing.warningDays,
          effectiveTo: formatDateOnly(closeDate),
        },
        newData: {
          id: next.id,
          scope: next.scope,
          targetId: next.productId ?? next.productGroupId,
          warningDays: next.warningDays,
          effectiveFrom: formatDateOnly(next.effectiveFrom),
        },
      });

      return next;
    });

    return toOverrideResponse(updated);
  }

  async endOverride(id: string, actorUserId: string): Promise<ThresholdHistoryItemResponse> {
    const existing = await this.prisma.expiryThreshold.findUnique({
      where: { id },
      select: THRESHOLD_SELECT,
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy ngưỡng cảnh báo');
    }
    if (existing.scope === 'GLOBAL') {
      throw new BadRequestException('Không thể kết thúc ngưỡng cảnh báo chung');
    }
    if (existing.effectiveTo !== null) {
      throw new ConflictException('Ngưỡng cảnh báo này đã kết thúc hiệu lực');
    }

    const todayStr = getVnTodayDateString();
    const todayDate = parseIsoDateStrict(todayStr);
    const closeDate = existing.effectiveFrom > todayDate ? existing.effectiveFrom : todayDate;

    const ended = await this.prisma.$transaction(async (tx) => {
      const row = await tx.expiryThreshold.update({
        where: { id: existing.id },
        data: { effectiveTo: closeDate },
        select: THRESHOLD_SELECT,
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'EXPIRY_THRESHOLD_OVERRIDE_ENDED',
        entityType: 'expiry_threshold',
        entityId: row.id,
        oldData: {
          scope: existing.scope,
          targetId: existing.productId ?? existing.productGroupId,
          warningDays: existing.warningDays,
          effectiveTo: null,
        },
        newData: {
          effectiveTo: formatDateOnly(closeDate),
        },
      });

      return row;
    });

    return toHistoryItem(ended);
  }

  async getHistory(query: ThresholdHistoryQueryDto): Promise<ThresholdHistoryResponse> {
    const where: Prisma.ExpiryThresholdWhereInput = {};
    if (query.scope) {
      where.scope = query.scope;
    }
    if (query.targetId) {
      if (query.scope === 'PRODUCT') {
        where.productId = query.targetId;
      } else if (query.scope === 'PRODUCT_GROUP') {
        where.productGroupId = query.targetId;
      } else {
        where.OR = [{ productId: query.targetId }, { productGroupId: query.targetId }];
      }
    }

    const rows = await this.prisma.expiryThreshold.findMany({
      where,
      select: THRESHOLD_SELECT,
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      items: rows.map(toHistoryItem),
    };
  }
}
