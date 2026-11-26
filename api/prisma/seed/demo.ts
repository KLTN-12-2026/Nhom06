import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { ExecutionsService } from '../../src/modules/ai/executions/executions.service';
import { ForecastService } from '../../src/modules/ai/forecast/forecast.service';
import { AnalysisPipelineService } from '../../src/modules/ai/pipeline/analysis-pipeline.service';
import { ProposalsService } from '../../src/modules/ai/proposals/proposals.service';
import { getVnTodayDateString, parseIsoDateStrict } from '../../src/modules/expiry/domain/vn-date';
import { ExpiryAlertsService } from '../../src/modules/expiry/expiry-alerts.service';
import { ExpiryThresholdsService } from '../../src/modules/expiry/expiry-thresholds.service';
import { InboundReceiptsService } from '../../src/modules/inbound/inbound-receipts.service';
import { StockCountsService } from '../../src/modules/inventory/stock-counts.service';
import { OrdersService } from '../../src/modules/outbound/orders.service';
import { OutboundReceiptsService } from '../../src/modules/outbound/outbound-receipts.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertDemoSeedAllowed, parseDemoSeedCliArgs } from './demo-guard';
import { buildDemoPlan } from './demo-plan';

export interface RunDemoSeedOptions {
  reset?: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface RunDemoSeedSummary {
  anchorDate: string;
  historicalCycleCount: number;
  activeLotCount: number;
  expiredLotCount: number;
  nearExpiryLotCount: number;
  pendingOrderCount: number;
  partialOrderCount: number;
  proposalCount: number;
  approvedExecutionId: string;
  durationMs: number;
}

const TRANSACTIONAL_AUDIT_ENTITY_TYPES = [
  'inbound_receipt',
  'outbound_receipt',
  'agency_order',
  'stock_count',
  'lot',
  'expiry_alert',
  'treatment_proposal',
  'treatment_execution',
] as const;

/**
 * Xóa dữ liệu nghiệp vụ trong một transaction theo thứ tự con → cha (tôn trọng ON DELETE RESTRICT).
 * Giữ nguyên tài khoản, vai trò, quyền, danh mục, ngưỡng HSD và lịch sử nhu cầu SIMULATED.
 */
async function resetBusinessData(prisma: PrismaService): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.treatmentExecutionUpdate.deleteMany();
      await tx.treatmentExecution.deleteMany();
      await tx.proposalDecision.deleteMany();
      await tx.llmExplanation.deleteMany();
      await tx.treatmentProposal.deleteMany();
      await tx.lotRiskAssessment.deleteMany();
      await tx.demandForecast.deleteMany();
      await tx.analysisRun.deleteMany();
      await tx.demandHistory.deleteMany({ where: { source: 'ACTUAL' } });
      await tx.expiryAlert.deleteMany();
      await tx.stockCountItem.deleteMany();
      await tx.stockCount.deleteMany();
      await tx.orderLotAllocation.deleteMany();
      await tx.outboundReceiptItem.deleteMany();
      await tx.outboundReceipt.deleteMany();
      await tx.agencyOrderItem.deleteMany();
      await tx.agencyOrder.deleteMany();
      await tx.stockMovement.deleteMany();
      await tx.inventoryLotBalance.deleteMany();
      await tx.inboundReceiptItem.deleteMany();
      await tx.inboundReceipt.deleteMany();
      await tx.lot.deleteMany();
      await tx.auditLog.deleteMany({
        where: { entityType: { in: [...TRANSACTIONAL_AUDIT_ENTITY_TYPES] } },
      });
    },
    { timeout: 30_000 },
  );
}

async function ensureDemoThresholds(
  prisma: PrismaService,
  thresholdsService: ExpiryThresholdsService,
  params: {
    firstHistoryDate: string;
    sp002Id: string;
    milkGroupId: string;
    managerId: string;
  },
): Promise<void> {
  // Đảm bảo ngưỡng GLOBAL có hiệu lực từ đầu chuỗi lịch sử 12 tháng để xác nhận xuất kho quá khứ hợp lệ
  const firstHistoryDateObj = parseIsoDateStrict(params.firstHistoryDate);
  const globalRow = await prisma.expiryThreshold.findFirst({
    where: { scope: 'GLOBAL', effectiveTo: null },
    select: { id: true, effectiveFrom: true },
  });
  if (!globalRow) {
    throw new Error('Thiếu ngưỡng cảnh báo GLOBAL — hãy chạy `npx prisma db seed` trước');
  }
  if (globalRow.effectiveFrom > firstHistoryDateObj) {
    await prisma.expiryThreshold.update({
      where: { id: globalRow.id },
      data: { effectiveFrom: firstHistoryDateObj },
    });
  }

  // Tạo/đồng bộ idempotent 2 ngưỡng riêng theo mockup 18: SP002 (10 ngày) và nhóm Sữa (45 ngày)
  const active = await thresholdsService.getActiveThresholds();

  const existingSp002 = active.overrides.find(
    (o) => o.scope === 'PRODUCT' && o.target.id === params.sp002Id,
  );
  if (!existingSp002) {
    await thresholdsService.createOverride(
      { scope: 'PRODUCT', targetId: params.sp002Id, warningDays: 10 },
      params.managerId,
    );
  } else if (existingSp002.warningDays !== 10) {
    await thresholdsService.updateOverride(
      existingSp002.id,
      { warningDays: 10 },
      params.managerId,
    );
  }

  const existingMilkGroup = active.overrides.find(
    (o) => o.scope === 'PRODUCT_GROUP' && o.target.id === params.milkGroupId,
  );
  if (!existingMilkGroup) {
    await thresholdsService.createOverride(
      { scope: 'PRODUCT_GROUP', targetId: params.milkGroupId, warningDays: 45 },
      params.managerId,
    );
  } else if (existingMilkGroup.warningDays !== 45) {
    await thresholdsService.updateOverride(
      existingMilkGroup.id,
      { warningDays: 45 },
      params.managerId,
    );
  }
}

export async function runDemoSeed(options: RunDemoSeedOptions = {}): Promise<RunDemoSeedSummary> {
  const startedAtMs = Date.now();
  const env = options.env ?? process.env;
  assertDemoSeedAllowed(env);

  // Tắt các job định kỳ và auto-trigger nền trong suốt quá trình seed
  const prevCronEnv = {
    EXPIRY_CRON_ENABLED: process.env.EXPIRY_CRON_ENABLED,
    ANALYSIS_CRON_ENABLED: process.env.ANALYSIS_CRON_ENABLED,
    ANALYSIS_AUTO_ENABLED: process.env.ANALYSIS_AUTO_ENABLED,
    ANALYSIS_AUTO_DEBOUNCE_MS: process.env.ANALYSIS_AUTO_DEBOUNCE_MS,
  };
  process.env.EXPIRY_CRON_ENABLED = 'false';
  process.env.ANALYSIS_CRON_ENABLED = 'false';
  process.env.ANALYSIS_AUTO_ENABLED = 'false';
  process.env.ANALYSIS_AUTO_DEBOUNCE_MS = '0';

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const inboundService = app.get(InboundReceiptsService);
    const ordersService = app.get(OrdersService);
    const outboundService = app.get(OutboundReceiptsService);
    const stockCountsService = app.get(StockCountsService);
    const thresholdsService = app.get(ExpiryThresholdsService);
    const alertsService = app.get(ExpiryAlertsService);
    const forecastService = app.get(ForecastService);
    const pipelineService = app.get(AnalysisPipelineService);
    const proposalsService = app.get(ProposalsService);
    const executionsService = app.get(ExecutionsService);

    // 1. Kiểm tra dữ liệu nền (tài khoản & danh mục) đã có từ base seed
    const [users, products, suppliers, agencies, milkGroup] = await Promise.all([
      prisma.user.findMany({
        where: { username: { in: ['admin', 'quanly', 'nhanvien'] } },
        select: { id: true, username: true },
      }),
      prisma.product.findMany({ select: { id: true, code: true } }),
      prisma.supplier.findMany({ select: { id: true, code: true } }),
      prisma.agency.findMany({ select: { id: true, code: true } }),
      prisma.productGroup.findUnique({ where: { code: 'SUA' }, select: { id: true } }),
    ]);

    const userByUsername = new Map(users.map((u) => [u.username, u.id]));
    const productByCode = new Map(products.map((p) => [p.code, p.id]));
    const supplierByCode = new Map(suppliers.map((s) => [s.code, s.id]));
    const agencyByCode = new Map(agencies.map((a) => [a.code, a.id]));

    const managerId = userByUsername.get('quanly');
    const staffId = userByUsername.get('nhanvien');
    if (!managerId || !staffId || !milkGroup || productByCode.size < 20) {
      throw new Error(
        'Thiếu dữ liệu nền (tài khoản/danh mục SP001..SP020/nhóm Sữa). Hãy chạy `npx prisma db seed` trước khi chạy `seed:demo`.',
      );
    }

    // 2. Xử lý cờ --reset hoặc chặn ghi đè khi chưa truyền --reset
    if (options.reset) {
      await resetBusinessData(prisma);
    } else {
      const [existingLots, existingInbounds] = await Promise.all([
        prisma.lot.count(),
        prisma.inboundReceipt.count(),
      ]);
      if (existingLots > 0 || existingInbounds > 0) {
        throw new Error(
          'Cơ sở dữ liệu đã có dữ liệu nghiệp vụ. Truyền cờ `--reset` (ví dụ: `npm run seed:demo -- --reset`) để dựng lại bộ dữ liệu demo sạch.',
        );
      }
    }

    const anchorDate = getVnTodayDateString();
    const plan = buildDemoPlan(anchorDate);

    // 3. Cấu hình ngưỡng HSD (GLOBAL lùi effectiveFrom nếu cần + 2 ngưỡng riêng SP002 & nhóm Sữa)
    await ensureDemoThresholds(prisma, thresholdsService, {
      firstHistoryDate: plan.firstHistoryDate,
      sp002Id: productByCode.get('SP002')!,
      milkGroupId: milkGroup.id,
      managerId,
    });

    // 4. Thực thi toàn bộ dòng thời gian (nhập, xuất lịch sử theo FEFO, kiểm kê, đơn xuất một phần)
    //    qua các service nghiệp vụ thật theo thứ tự thời gian tăng dần (tôn trọng skill stock-transaction).
    const lotIdByKey = new Map<string, string>();
    let historicalOutboundCount = 0;

    for (const event of plan.timeline) {
      if (event.kind === 'INBOUND') {
        const draft = await inboundService.create(
          {
            supplierId: supplierByCode.get(event.supplierCode)!,
            receiptDate: event.date,
            notes: event.notes,
            items: event.items.map((item) => ({
              productId: productByCode.get(item.productCode)!,
              lotCode: item.lotCode,
              expiryDate: item.expiryDate,
              manufacturedDate: item.manufacturedDate,
              quantity: String(item.quantity),
              unitCost: String(item.unitCost),
            })),
          },
          staffId,
        );

        const confirmedInbound = await inboundService.confirm(draft.id, staffId, {
          confirmedAt: new Date(event.occurredAtIso),
        });

        for (const item of confirmedInbound.items) {
          if (item.lotId) {
            lotIdByKey.set(`${item.product.code}::${item.lotCode}`, item.lotId);
          }
        }
      } else if (event.kind === 'OUTBOUND') {
        const order = await ordersService.create(
          {
            agencyId: agencyByCode.get(event.agencyCode)!,
            orderDate: event.date,
            notes: `Đơn đại lý lịch sử tháng ${event.monthKey} (đợt ${event.batchIndex})`,
            items: event.items.map((item) => ({
              productId: productByCode.get(item.productCode)!,
              requestedQty: String(item.quantity),
            })),
          },
          staffId,
        );

        const orderItemByProductCode = new Map(
          order.items.map((oi) => [oi.product.code, oi.id]),
        );

        const confirmedOutbound = await outboundService.confirmForOrder(
          order.id,
          {
            notes: event.notes,
            items: event.items.map((item) => ({
              orderItemId: orderItemByProductCode.get(item.productCode)!,
              lotId: lotIdByKey.get(`${item.productCode}::${item.lotCode}`)!,
              quantity: String(item.quantity),
            })),
          },
          staffId,
          { confirmedAt: new Date(event.occurredAtIso) },
        );

        if (confirmedOutbound.warnings.length > 0) {
          throw new Error(
            `Phát hiện cảnh báo vượt FEFO ở đợt xuất lịch sử ${event.monthKey} B${event.batchIndex}: ` +
              JSON.stringify(confirmedOutbound.warnings),
          );
        }
        historicalOutboundCount += 1;
      } else if (event.kind === 'STOCK_COUNT') {
        const stockCountDraft = await stockCountsService.create(
          {
            countedAt: event.countedAtIso,
            note: event.note,
            items: event.items.map((item) => ({
              lotId: lotIdByKey.get(`${item.productCode}::${item.lotCode}`)!,
              countedQty: String(item.countedQty),
              reason: item.reason,
            })),
          },
          staffId,
        );
        await stockCountsService.submit(stockCountDraft.id, staffId);
        await stockCountsService.approve(stockCountDraft.id, managerId, {
          approvedAt: new Date(event.occurredAtIso),
        });
      } else if (event.kind === 'PARTIAL_ORDER') {
        const partialOrderCreated = await ordersService.create(
          {
            agencyId: agencyByCode.get(event.agencyCode)!,
            orderDate: event.orderDate,
            notes: event.notes,
            items: event.items.map((item) => ({
              productId: productByCode.get(item.productCode)!,
              requestedQty: String(item.requestedQty),
            })),
          },
          staffId,
        );
        const partialOrderItemByProductCode = new Map(
          partialOrderCreated.items.map((oi) => [oi.product.code, oi.id]),
        );

        const confirmedPartial = await outboundService.confirmForOrder(
          partialOrderCreated.id,
          {
            notes: 'Xuất đợt 1 cho đơn giao 2 đợt',
            items: event.shippedItems.map((ship) => ({
              orderItemId: partialOrderItemByProductCode.get(ship.productCode)!,
              lotId: lotIdByKey.get(`${ship.productCode}::${ship.lotCode}`)!,
              quantity: String(ship.quantity),
            })),
          },
          staffId,
          { confirmedAt: new Date(event.occurredAtIso) },
        );

        if (confirmedPartial.warnings.length > 0) {
          throw new Error(
            `Phát hiện cảnh báo vượt FEFO ở đơn xuất một phần: ${JSON.stringify(confirmedPartial.warnings)}`,
          );
        }
      }
    }

    // 5. Tạo 3 đơn đại lý chờ xuất (confirmed)
    for (const pendingOrder of plan.pendingOrders) {
      await ordersService.create(
        {
          agencyId: agencyByCode.get(pendingOrder.agencyCode)!,
          orderDate: pendingOrder.orderDate,
          notes: pendingOrder.notes,
          items: pendingOrder.items.map((item) => ({
            productId: productByCode.get(item.productCode)!,
            requestedQty: String(item.requestedQty),
          })),
        },
        staffId,
      );
    }

    // 8. Đánh giá cảnh báo HSD, chạy dự báo (/forecast) và pipeline phân tích FULL
    const alertEval = await alertsService.evaluate(anchorDate, managerId, 'MANUAL');
    await forecastService.runForecast(60, managerId);
    await pipelineService.run({
      trigger: 'MANUAL',
      requestedBy: managerId,
      horizonDays: 60,
    });

    // 9. Duyệt sẵn 1 đề xuất PRIORITIZE_FEFO (ưu tiên lô DEMO-SP004-NEAR) & ghi kết quả thực hiện 120 đơn vị
    const proposalsList = await proposalsService.list({ actionType: 'PRIORITIZE_FEFO' });
    const targetProposal =
      proposalsList.items.find(
        (p) => p.lot.lotCode === 'DEMO-SP004-NEAR' && p.status === 'pending',
      ) ??
      proposalsList.items.find(
        (p) => p.status === 'pending' && new Prisma.Decimal(p.proposedQty).gte(120),
      );

    if (!targetProposal) {
      throw new Error(
        'Không tìm thấy đề xuất PRIORITIZE_FEFO có lượng đề xuất >= 120 để duyệt sẵn trong demo',
      );
    }

    const approvedProposal = await proposalsService.approve(
      targetProposal.id,
      {
        note: 'Phê duyệt ưu tiên xuất theo FEFO cho các đơn đại lý trong tuần',
        responsibleUserId: staffId,
      },
      managerId,
    );

    if (!approvedProposal.execution) {
      throw new Error('Không tạo được phương án thực hiện sau khi phê duyệt đề xuất demo');
    }

    await executionsService.recordUpdate(
      approvedProposal.execution.id,
      {
        status: 'in_progress',
        actualQtyDelta: '120',
        occurredOn: anchorDate,
        note: 'Đã ưu tiên điều phối xuất 120 thùng theo FEFO cho đại lý khu vực Hải Châu',
      },
      staffId,
    );

    const [activeLotCount, proposalCount] = await Promise.all([
      prisma.inventoryLotBalance.count({ where: { onHandQty: { gt: 0 } } }),
      prisma.treatmentProposal.count(),
    ]);

    return {
      anchorDate,
      historicalCycleCount: historicalOutboundCount,
      activeLotCount,
      expiredLotCount: alertEval.expiredLots,
      nearExpiryLotCount: alertEval.criticalLots + alertEval.warningLots,
      pendingOrderCount: plan.pendingOrders.length,
      partialOrderCount: 1,
      proposalCount,
      approvedExecutionId: approvedProposal.execution.id,
      durationMs: Date.now() - startedAtMs,
    };
  } finally {
    await app.close();
    process.env.EXPIRY_CRON_ENABLED = prevCronEnv.EXPIRY_CRON_ENABLED;
    process.env.ANALYSIS_CRON_ENABLED = prevCronEnv.ANALYSIS_CRON_ENABLED;
    process.env.ANALYSIS_AUTO_ENABLED = prevCronEnv.ANALYSIS_AUTO_ENABLED;
    process.env.ANALYSIS_AUTO_DEBOUNCE_MS = prevCronEnv.ANALYSIS_AUTO_DEBOUNCE_MS;
  }
}

async function main(): Promise<void> {
  const cliOptions = parseDemoSeedCliArgs(process.argv.slice(2));
  const summary = await runDemoSeed({ reset: cliOptions.reset });
  console.log(
    `[seed:demo] Hoàn tất trong ${(summary.durationMs / 1000).toFixed(1)}s (D=${summary.anchorDate}): ` +
      `${summary.activeLotCount} lô còn hàng (${summary.expiredLotCount} hết hạn, ${summary.nearExpiryLotCount} cận hạn), ` +
      `${summary.historicalCycleCount} đợt lịch sử 12 tháng, ${summary.pendingOrderCount} đơn chờ + ${summary.partialOrderCount} đơn xuất một phần, ` +
      `${summary.proposalCount} đề xuất (1 đang thực hiện 120 đơn vị).`,
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[seed:demo] Lỗi: ${message}`);
    process.exit(1);
  });
}
