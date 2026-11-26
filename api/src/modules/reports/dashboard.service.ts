import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import {
  classifyExpirySeverity,
  type ExpirySeverity,
  selectApplicableThreshold,
  type ThresholdRecord,
  type ThresholdScope,
} from '../expiry/domain/expiry-policy';
import { diffCalendarDays, formatDateOnly } from '../expiry/domain/vn-date';
import { ExpiryAlertsService } from '../expiry/expiry-alerts.service';
import { ExpiryThresholdsService } from '../expiry/expiry-thresholds.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  computeValueAtRisk,
  type InboundCostEntry,
  RISK_LEVEL_PRIORITY,
  type RiskLevel,
  type RiskLevelSummaryItem,
  summarizeRiskLevels,
  type ValueAtRiskResult,
} from './domain/risk-report.domain';
import { type MonthlyInOutPoint } from './domain/stock-ledger.domain';
import { StockLedgerService } from './stock-ledger.service';

export interface DashboardTopLotItem {
  lotId: string;
  lotCode: string;
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  onHandQty: string;
  expiryDate: string;
  daysRemaining: number;
  warningDays: number;
  expirySeverity: ExpirySeverity;
  riskLevel: RiskLevel | null;
  estimatedSurplusQty: string | null;
}

export interface DashboardPendingOrderItem {
  id: string;
  orderNo: string;
  orderDate: string;
  status: string;
  agency: {
    id: string;
    code: string;
    name: string;
  };
  itemCount: number;
}

export interface DashboardResponse {
  asOf: string;
  totalOnHand: string;
  lotsInStock: number;
  nearExpiry: {
    lots: number;
    qty: string;
  };
  expired: {
    lots: number;
    qty: string;
  };
  valueAtRisk: ValueAtRiskResult | null;
  monthlyInOut: MonthlyInOutPoint[];
  riskSummary: RiskLevelSummaryItem[] | null;
  topLots: DashboardTopLotItem[];
  pendingProposals: number | null;
  pendingOrders: DashboardPendingOrderItem[];
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly expiryAlertsService: ExpiryAlertsService,
    private readonly thresholdsService: ExpiryThresholdsService,
    private readonly stockLedgerService: StockLedgerService,
  ) {}

  async getDashboard(user: AuthenticatedUser): Promise<DashboardResponse> {
    const permissions = new Set(user.permissions ?? []);
    if (!permissions.has('reports.read') && !permissions.has('inventory.read')) {
      throw new ForbiddenException('Bạn không có quyền truy cập bảng điều khiển');
    }

    const canReadReports = permissions.has('reports.read');
    const canReadAnalysis = permissions.has('analysis.read');
    const canReadProposals = permissions.has('proposals.read');
    const canReadOrders = permissions.has('orders.read');

    const [inventorySummary, expirySummary, monthlyInOut, pendingProposals, pendingOrderRows] =
      await Promise.all([
        this.inventoryService.getSummary({}),
        this.expiryAlertsService.summary(),
        this.stockLedgerService.getMonthlyInOut({ months: 12 }),
        canReadProposals
          ? this.prisma.treatmentProposal.count({
              where: { status: { in: ['new', 'pending'] } },
            })
          : Promise.resolve(null),
        canReadOrders
          ? this.prisma.agencyOrder.findMany({
              where: { status: { in: ['confirmed', 'partial'] } },
              orderBy: [{ orderDate: 'asc' }, { createdAt: 'asc' }],
              take: 5,
              select: {
                id: true,
                orderNo: true,
                orderDate: true,
                status: true,
                agency: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                  },
                },
                _count: {
                  select: { items: true },
                },
              },
            })
          : Promise.resolve([]),
      ]);

    const pendingOrders: DashboardPendingOrderItem[] = pendingOrderRows.map((order) => ({
      id: order.id,
      orderNo: order.orderNo,
      orderDate: formatDateOnly(order.orderDate),
      status: order.status,
      agency: order.agency,
      itemCount: order._count.items,
    }));

    let valueAtRisk: ValueAtRiskResult | null = null;
    let riskSummary: RiskLevelSummaryItem[] | null = null;
    let topLots: DashboardTopLotItem[] = [];

    if (canReadAnalysis) {
      const latestRun = await this.prisma.analysisRun.findFirst({
        where: {
          status: 'succeeded',
          runType: { in: ['RISK', 'FULL'] },
        },
        orderBy: [{ finishedAt: 'desc' }, { createdAt: 'desc' }],
        select: { id: true },
      });

      if (latestRun) {
        const assessments = await this.prisma.lotRiskAssessment.findMany({
          where: { analysisRunId: latestRun.id },
          select: {
            lotId: true,
            estimatedSurplusQty: true,
            riskLevel: true,
            lot: {
              select: {
                id: true,
                lotCode: true,
                expiryDate: true,
                status: true,
                balance: {
                  select: { onHandQty: true },
                },
                product: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    unit: true,
                    groupId: true,
                  },
                },
              },
            },
          },
        });

        riskSummary = summarizeRiskLevels(assessments);

        if (canReadReports) {
          const surplusLotIds = assessments
            .filter((a) => a.estimatedSurplusQty.gt(0))
            .map((a) => a.lotId);

          const inboundCostRows =
            surplusLotIds.length > 0
              ? await this.prisma.inboundReceiptItem.findMany({
                  where: {
                    lotId: { in: surplusLotIds },
                    unitCost: { not: null },
                    receipt: { status: 'confirmed' },
                  },
                  select: {
                    lotId: true,
                    quantity: true,
                    unitCost: true,
                  },
                })
              : [];

          const costByLot = new Map<string, InboundCostEntry[]>();
          for (const row of inboundCostRows) {
            if (!row.lotId || row.unitCost === null) {
              continue;
            }
            const list = costByLot.get(row.lotId) ?? [];
            list.push({ quantity: row.quantity, unitCost: row.unitCost });
            costByLot.set(row.lotId, list);
          }

          valueAtRisk = computeValueAtRisk(
            assessments.map((a) => ({
              lotId: a.lotId,
              estimatedSurplusQty: a.estimatedSurplusQty,
              inboundCosts: costByLot.get(a.lotId) ?? [],
            })),
          );
        }

        const { dateStr: evalDateStr, dateObj: evalDateObj } =
          this.thresholdsService.resolveEvaluationDate();
        const thresholdRows = await this.thresholdsService.loadEffectiveRowsAtDate(evalDateObj);
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

        const priorityLots = assessments
          .filter((a) => {
            const level = a.riskLevel as RiskLevel;
            const onHand = a.lot.balance?.onHandQty ?? new Prisma.Decimal(0);
            return (
              (level === 'critical' || level === 'high' || level === 'medium') && onHand.gt(0)
            );
          })
          .sort((a, b) => {
            const pA = RISK_LEVEL_PRIORITY[a.riskLevel as RiskLevel] ?? 99;
            const pB = RISK_LEVEL_PRIORITY[b.riskLevel as RiskLevel] ?? 99;
            if (pA !== pB) {
              return pA - pB;
            }
            const expCmp = formatDateOnly(a.lot.expiryDate).localeCompare(
              formatDateOnly(b.lot.expiryDate),
            );
            if (expCmp !== 0) {
              return expCmp;
            }
            return a.lot.lotCode.localeCompare(b.lot.lotCode);
          })
          .slice(0, 10);

        topLots = priorityLots.map((a) => {
          const expiryDateStr = formatDateOnly(a.lot.expiryDate);
          const daysRemaining = diffCalendarDays(expiryDateStr, evalDateStr);
          const resolved = selectApplicableThreshold(
            domainThresholds,
            a.lot.product.id,
            a.lot.product.groupId,
            evalDateStr,
          );
          const expirySeverity = classifyExpirySeverity(
            daysRemaining,
            resolved.warningDays,
            resolved.criticalDays,
          );
          const onHand = a.lot.balance?.onHandQty ?? new Prisma.Decimal(0);

          return {
            lotId: a.lot.id,
            lotCode: a.lot.lotCode,
            product: {
              id: a.lot.product.id,
              code: a.lot.product.code,
              name: a.lot.product.name,
              unit: a.lot.product.unit,
            },
            onHandQty: onHand.toString(),
            expiryDate: expiryDateStr,
            daysRemaining,
            warningDays: resolved.warningDays,
            expirySeverity,
            riskLevel: a.riskLevel as RiskLevel,
            estimatedSurplusQty: a.estimatedSurplusQty.toString(),
          };
        });
      }
    }

    // Fallback khi chưa có lượt phân tích rủi ro hoặc thiếu quyền analysis.read:
    // hiển thị tối đa 10 lô hết hạn/cận hạn từ cảnh báo HSD mà không bịa mức rủi ro AI.
    if (riskSummary === null) {
      const alertList = await this.expiryAlertsService.list({ page: 1, pageSize: 10 });
      topLots = alertList.items.map((item) => ({
        lotId: item.lot.id,
        lotCode: item.lot.lotCode,
        product: {
          id: item.product.id,
          code: item.product.code,
          name: item.product.name,
          unit: item.product.unit,
        },
        onHandQty: item.onHandQty,
        expiryDate: item.expiryDate,
        daysRemaining: item.daysRemaining,
        warningDays: item.thresholdApplied.warningDays,
        expirySeverity: item.severity,
        riskLevel: null,
        estimatedSurplusQty: null,
      }));
    }

    return {
      asOf: expirySummary.evaluationDate,
      totalOnHand: inventorySummary.totalQty,
      lotsInStock: inventorySummary.lotCount,
      nearExpiry: expirySummary.nearExpiry,
      expired: expirySummary.expired,
      valueAtRisk,
      monthlyInOut,
      riskSummary,
      topLots,
      pendingProposals,
      pendingOrders,
    };
  }
}
