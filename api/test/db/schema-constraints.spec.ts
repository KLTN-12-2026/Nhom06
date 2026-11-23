import { Prisma, PrismaClient } from '@prisma/client';

const EXPECTED_TABLES = [
  'app_meta',
  // AUTH (6)
  'users',
  'roles',
  'permissions',
  'user_roles',
  'role_permissions',
  'audit_logs',
  // CATALOG (4)
  'product_groups',
  'products',
  'suppliers',
  'agencies',
  // INBOUND (3)
  'inbound_receipts',
  'inbound_receipt_items',
  'lots',
  // INVENTORY (4)
  'inventory_lot_balances',
  'stock_movements',
  'stock_counts',
  'stock_count_items',
  // OUTBOUND (5)
  'agency_orders',
  'agency_order_items',
  'order_lot_allocations',
  'outbound_receipts',
  'outbound_receipt_items',
  // EXPIRY (2)
  'expiry_thresholds',
  'expiry_alerts',
  // AI (9 — gồm demand_history theo D-017)
  'analysis_runs',
  'demand_forecasts',
  'demand_history',
  'lot_risk_assessments',
  'treatment_proposals',
  'llm_explanations',
  'proposal_decisions',
  'treatment_executions',
  'treatment_execution_updates',
].sort();

describe('Ràng buộc và lược đồ PostgreSQL (T-004)', () => {
  let prisma: PrismaClient;

  // Fixture IDs tạo riêng cho bộ test, dọn sạch sau khi chạy xong
  let userId: string;
  let productGroupId: string;
  let productId: string;
  let supplierId: string;
  let agencyId: string;
  let lotId: string;
  let inboundReceiptId: string;
  let agencyOrderId: string;
  let analysisRunId: string;
  let riskAssessmentId: string;
  let stockCountId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const suffix = Date.now().toString();

    const user = await prisma.user.create({
      data: {
        username: `test_t004_user_${suffix}`,
        email: `test_t004_user_${suffix}@kho-ai.local`,
        passwordHash: '$2b$10$placeholderhashfortestingconstraints000000000000000000',
        fullName: 'Người dùng kiểm thử T-004',
        status: 'active',
      },
    });
    userId = user.id;

    const group = await prisma.productGroup.create({
      data: {
        code: `TEST_T004_GRP_${suffix}`,
        name: 'Nhóm hàng kiểm thử T-004',
      },
    });
    productGroupId = group.id;

    const product = await prisma.product.create({
      data: {
        code: `TEST_T004_SP_${suffix}`,
        name: 'Sản phẩm kiểm thử T-004',
        groupId: productGroupId,
        unit: 'thùng',
      },
    });
    productId = product.id;

    const supplier = await prisma.supplier.create({
      data: {
        code: `TEST_T004_NCC_${suffix}`,
        name: 'Nhà cung cấp kiểm thử T-004',
      },
    });
    supplierId = supplier.id;

    const agency = await prisma.agency.create({
      data: {
        code: `TEST_T004_DL_${suffix}`,
        name: 'Đại lý kiểm thử T-004',
      },
    });
    agencyId = agency.id;

    const lot = await prisma.lot.create({
      data: {
        productId,
        supplierId,
        lotCode: `TEST_T004_LOT_${suffix}`,
        manufacturedDate: new Date('2026-01-01'),
        expiryDate: new Date('2026-12-31'),
        receivedAt: new Date('2026-01-10'),
        initialQuantity: new Prisma.Decimal('100.000'),
      },
    });
    lotId = lot.id;

    const inbound = await prisma.inboundReceipt.create({
      data: {
        receiptNo: `TEST_T004_PN_${suffix}`,
        supplierId,
        receiptDate: new Date('2026-01-10'),
        createdBy: userId,
      },
    });
    inboundReceiptId = inbound.id;

    const order = await prisma.agencyOrder.create({
      data: {
        orderNo: `TEST_T004_DH_${suffix}`,
        agencyId,
        orderDate: new Date('2026-01-15'),
        status: 'confirmed',
        createdBy: userId,
      },
    });
    agencyOrderId = order.id;

    const run = await prisma.analysisRun.create({
      data: {
        runType: 'FULL',
        triggerType: 'MANUAL',
        status: 'succeeded',
        requestedBy: userId,
      },
    });
    analysisRunId = run.id;

    const risk = await prisma.lotRiskAssessment.create({
      data: {
        analysisRunId,
        lotId,
        onHandSnapshot: new Prisma.Decimal('80.000'),
        estimatedDemandBeforeExpiry: new Prisma.Decimal('30.000'),
        estimatedSurplusQty: new Prisma.Decimal('50.000'),
        riskLevel: 'high',
        basis: { fefoRank: 1 },
      },
    });
    riskAssessmentId = risk.id;

    const stockCount = await prisma.stockCount.create({
      data: {
        countNo: `TEST_T004_KK_${suffix}`,
        countedAt: new Date('2026-01-20T08:00:00Z'),
        createdBy: userId,
      },
    });
    stockCountId = stockCount.id;
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }

    // Dọn fixture theo thứ tự ngược khóa ngoại
    await prisma.proposalDecision.deleteMany({
      where: { proposal: { lotId } },
    });
    await prisma.treatmentProposal.deleteMany({
      where: { lotId },
    });
    await prisma.lotRiskAssessment.deleteMany({
      where: { id: riskAssessmentId },
    });
    await prisma.analysisRun.deleteMany({
      where: { requestedBy: userId },
    });
    await prisma.outboundReceipt.deleteMany({
      where: { createdBy: userId },
    });
    await prisma.agencyOrder.deleteMany({
      where: { id: agencyOrderId },
    });
    await prisma.stockCountItem.deleteMany({
      where: { countId: stockCountId },
    });
    await prisma.stockCount.deleteMany({
      where: { id: stockCountId },
    });
    await prisma.stockMovement.deleteMany({
      where: { lotId },
    });
    await prisma.inventoryLotBalance.deleteMany({
      where: { lotId },
    });
    await prisma.inboundReceiptItem.deleteMany({
      where: { receiptId: inboundReceiptId },
    });
    await prisma.inboundReceipt.deleteMany({
      where: { createdBy: userId },
    });
    await prisma.expiryThreshold.deleteMany({
      where: { createdBy: userId },
    });
    await prisma.lot.deleteMany({
      where: { productId },
    });
    await prisma.product.deleteMany({
      where: { id: productId },
    });
    await prisma.productGroup.deleteMany({
      where: { id: productGroupId },
    });
    await prisma.supplier.deleteMany({
      where: { id: supplierId },
    });
    await prisma.agency.deleteMany({
      where: { id: agencyId },
    });
    await prisma.user.deleteMany({
      where: { id: userId },
    });

    await prisma.$disconnect();
  });

  // AC2
  it('có đủ 32 bảng nghiệp vụ và app_meta, có stock_movements và không có forecast_models', async () => {
    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
      ORDER BY table_name
    `;

    const tableNames = rows.map((r) => r.table_name).sort();
    expect(tableNames).toContain('stock_movements');
    expect(tableNames).not.toContain('forecast_models');
    expect(tableNames).toEqual(EXPECTED_TABLES);
    expect(tableNames).toHaveLength(EXPECTED_TABLES.length);
  });

  // AC7
  it('khai báo đúng kiểu numeric(14,3), date và timestamptz cho các cột đại diện', async () => {
    const columns = await prisma.$queryRaw<
      Array<{
        table_name: string;
        column_name: string;
        data_type: string;
        numeric_precision: number | null;
        numeric_scale: number | null;
      }>
    >`
      SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'inventory_lot_balances' AND column_name = 'on_hand_qty')
          OR (table_name = 'lots' AND column_name = 'expiry_date')
          OR (table_name = 'stock_movements' AND column_name = 'occurred_at')
        )
    `;

    const byKey = new Map(columns.map((c) => [`${c.table_name}.${c.column_name}`, c]));

    expect(byKey.get('inventory_lot_balances.on_hand_qty')).toMatchObject({
      data_type: 'numeric',
      numeric_precision: 14,
      numeric_scale: 3,
    });
    expect(byKey.get('lots.expiry_date')).toMatchObject({
      data_type: 'date',
    });
    expect(byKey.get('stock_movements.occurred_at')).toMatchObject({
      data_type: 'timestamp with time zone',
    });
  });

  // AC3.1
  it('từ chối tồn âm trong inventory_lot_balances', async () => {
    await expect(
      prisma.inventoryLotBalance.create({
        data: {
          lotId,
          onHandQty: new Prisma.Decimal('-1.000'),
        },
      }),
    ).rejects.toThrow(/chk_inventory_lot_balances_on_hand_qty/);
  });

  // AC3.2
  it('từ chối quantity = 0 ở inbound_receipt_items', async () => {
    await expect(
      prisma.inboundReceiptItem.create({
        data: {
          receiptId: inboundReceiptId,
          productId,
          lotId,
          quantity: new Prisma.Decimal('0'),
        },
      }),
    ).rejects.toThrow(/chk_inbound_receipt_items_quantity/);
  });

  // AC3.3
  it('từ chối lô hàng có HSD bằng hoặc nhỏ hơn ngày sản xuất', async () => {
    await expect(
      prisma.lot.create({
        data: {
          productId,
          supplierId,
          lotCode: 'TEST_T004_LOT_BAD_EQ',
          manufacturedDate: new Date('2026-06-01'),
          expiryDate: new Date('2026-06-01'),
          receivedAt: new Date('2026-06-01'),
          initialQuantity: new Prisma.Decimal('10'),
        },
      }),
    ).rejects.toThrow(/chk_lots_expiry_after_mfg/);

    await expect(
      prisma.lot.create({
        data: {
          productId,
          supplierId,
          lotCode: 'TEST_T004_LOT_BAD_LT',
          manufacturedDate: new Date('2026-06-02'),
          expiryDate: new Date('2026-06-01'),
          receivedAt: new Date('2026-06-02'),
          initialQuantity: new Prisma.Decimal('10'),
        },
      }),
    ).rejects.toThrow(/chk_lots_expiry_after_mfg/);
  });

  // AC3.4
  it('từ chối trùng cặp (product_id, lot_code) trong lots', async () => {
    const existingLot = await prisma.lot.findUniqueOrThrow({ where: { id: lotId } });

    await expect(
      prisma.lot.create({
        data: {
          productId,
          supplierId,
          lotCode: existingLot.lotCode,
          expiryDate: new Date('2027-01-01'),
          receivedAt: new Date('2026-02-01'),
          initialQuantity: new Prisma.Decimal('20'),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  // AC3.5
  it('từ chối outbound_receipts có outbound_type = ORDER nhưng order_id là NULL (và chiều ngược lại)', async () => {
    await expect(
      prisma.outboundReceipt.create({
        data: {
          outboundNo: `TEST_T004_PX_BAD1_${Date.now()}`,
          outboundType: 'ORDER',
          orderId: null,
          createdBy: userId,
        },
      }),
    ).rejects.toThrow(/chk_outbound_receipts_order_link/);

    await expect(
      prisma.outboundReceipt.create({
        data: {
          outboundNo: `TEST_T004_PX_BAD2_${Date.now()}`,
          outboundType: 'DISPOSAL',
          orderId: agencyOrderId,
          createdBy: userId,
        },
      }),
    ).rejects.toThrow(/chk_outbound_receipts_order_link/);
  });

  // AC3.6
  it('từ chối quyết định từ chối đề xuất khi thiếu lý do hoặc chỉ có khoảng trắng', async () => {
    const proposal = await prisma.treatmentProposal.create({
      data: {
        riskAssessmentId,
        lotId,
        actionType: 'CONTACT_AGENCY',
        proposedQty: new Prisma.Decimal('10'),
        rationale: 'Đề xuất kiểm thử quyết định',
        sourceRunId: analysisRunId,
        status: 'pending',
        snapshot: { surplus: 10 },
      },
    });

    try {
      await expect(
        prisma.proposalDecision.create({
          data: {
            proposalId: proposal.id,
            decision: 'rejected',
            decidedBy: userId,
            reason: null,
          },
        }),
      ).rejects.toThrow(/chk_proposal_decisions_reject_reason/);

      await expect(
        prisma.proposalDecision.create({
          data: {
            proposalId: proposal.id,
            decision: 'rejected',
            decidedBy: userId,
            reason: '   ',
          },
        }),
      ).rejects.toThrow(/chk_proposal_decisions_reject_reason/);
    } finally {
      await prisma.treatmentProposal.delete({ where: { id: proposal.id } });
    }
  });

  // AC3.7
  it('từ chối hai lượt analysis_runs cùng trạng thái running', async () => {
    const running1 = await prisma.analysisRun.create({
      data: {
        runType: 'FULL',
        triggerType: 'MANUAL',
        status: 'running',
        requestedBy: userId,
      },
    });

    try {
      await expect(
        prisma.analysisRun.create({
          data: {
            runType: 'RISK',
            triggerType: 'SCHEDULED',
            status: 'running',
            requestedBy: userId,
          },
        }),
      ).rejects.toThrow(/uq_analysis_runs_single_running|Unique constraint/);
    } finally {
      await prisma.analysisRun.delete({ where: { id: running1.id } });
    }
  });

  // AC3.8
  it('từ chối hai đề xuất hoạt động cùng (lot_id, action_type) nhưng cho phép tạo mới khi đề xuất cũ đã rejected', async () => {
    const activeProposal = await prisma.treatmentProposal.create({
      data: {
        riskAssessmentId,
        lotId,
        actionType: 'PRIORITIZE_FEFO',
        proposedQty: new Prisma.Decimal('15'),
        rationale: 'Đề xuất đang hoạt động',
        sourceRunId: analysisRunId,
        status: 'pending',
        snapshot: { surplus: 15 },
      },
    });

    const createdIds = [activeProposal.id];
    try {
      // Tạo đề xuất hoạt động thứ 2 cùng (lot_id, action_type) -> phải lỗi
      await expect(
        prisma.treatmentProposal.create({
          data: {
            riskAssessmentId,
            lotId,
            actionType: 'PRIORITIZE_FEFO',
            proposedQty: new Prisma.Decimal('20'),
            rationale: 'Đề xuất trùng đang hoạt động',
            sourceRunId: analysisRunId,
            status: 'new',
            snapshot: { surplus: 20 },
          },
        }),
      ).rejects.toThrow(/uq_treatment_proposals_active_lot_action|Unique constraint/);

      // Chuyển đề xuất cũ sang rejected -> phải tạo mới thành công
      await prisma.treatmentProposal.update({
        where: { id: activeProposal.id },
        data: { status: 'rejected' },
      });

      const replacement = await prisma.treatmentProposal.create({
        data: {
          riskAssessmentId,
          lotId,
          actionType: 'PRIORITIZE_FEFO',
          proposedQty: new Prisma.Decimal('12'),
          rationale: 'Đề xuất mới sau khi đề xuất cũ bị từ chối',
          sourceRunId: analysisRunId,
          status: 'new',
          snapshot: { surplus: 12 },
        },
      });
      createdIds.push(replacement.id);
      expect(replacement.id).toBeDefined();
    } finally {
      await prisma.treatmentProposal.deleteMany({
        where: { id: { in: createdIds } },
      });
    }
  });

  // AC3.9
  it('từ chối expiry_thresholds có critical_days > warning_days', async () => {
    await expect(
      prisma.expiryThreshold.create({
        data: {
          warningDays: 7,
          criticalDays: 10,
          effectiveFrom: new Date('2026-03-01'),
          createdBy: userId,
        },
      }),
    ).rejects.toThrow(/chk_expiry_thresholds_critical_days/);
  });

  // T-011 AC3: D-019 CHECK & partial unique index cho expiry_thresholds
  it('từ chối expiry_thresholds sai nhất quán scope/target, min_delivery_days âm và chặn 2 bản đang hiệu lực cùng đối tượng', async () => {
    // Sai scope/target: PRODUCT nhưng thiếu productId
    await expect(
      prisma.expiryThreshold.create({
        data: {
          scope: 'PRODUCT',
          warningDays: 10,
          effectiveFrom: new Date('2026-03-01'),
          createdBy: userId,
        },
      }),
    ).rejects.toThrow(/chk_expiry_thresholds_scope_target/);

    // Sai min_delivery_days âm
    await expect(
      prisma.expiryThreshold.create({
        data: {
          scope: 'GLOBAL',
          warningDays: 30,
          criticalDays: 7,
          minDeliveryDays: -1,
          effectiveFrom: new Date('2026-03-01'),
          effectiveTo: new Date('2026-03-02'),
          createdBy: userId,
        },
      }),
    ).rejects.toThrow(/chk_expiry_thresholds_min_delivery_days/);

    // Partial unique index: không cho phép 2 bản PRODUCT đang hiệu lực (effective_to IS NULL) cùng productId
    const activeProd = await prisma.expiryThreshold.create({
      data: {
        scope: 'PRODUCT',
        productId,
        warningDays: 12,
        effectiveFrom: new Date('2026-03-01'),
        effectiveTo: null,
        createdBy: userId,
      },
    });

    // Partial unique index: không cho phép 2 bản PRODUCT_GROUP đang hiệu lực cùng productGroupId
    const activeGroup = await prisma.expiryThreshold.create({
      data: {
        scope: 'PRODUCT_GROUP',
        productGroupId,
        warningDays: 45,
        effectiveFrom: new Date('2026-03-01'),
        effectiveTo: null,
        createdBy: userId,
      },
    });

    const createdThresholdIds = [activeProd.id, activeGroup.id];
    try {
      await expect(
        prisma.expiryThreshold.create({
          data: {
            scope: 'PRODUCT',
            productId,
            warningDays: 15,
            effectiveFrom: new Date('2026-03-02'),
            effectiveTo: null,
            createdBy: userId,
          },
        }),
      ).rejects.toThrow(/uq_expiry_thresholds_active_product|Unique constraint/);

      await expect(
        prisma.expiryThreshold.create({
          data: {
            scope: 'PRODUCT_GROUP',
            productGroupId,
            warningDays: 40,
            effectiveFrom: new Date('2026-03-02'),
            effectiveTo: null,
            createdBy: userId,
          },
        }),
      ).rejects.toThrow(/uq_expiry_thresholds_active_group|Unique constraint/);

      // Sau khi đóng bản cũ (effective_to != NULL), tạo bản mới cho cùng productId thành công
      await prisma.expiryThreshold.update({
        where: { id: activeProd.id },
        data: { effectiveTo: new Date('2026-03-05') },
      });
      const replacement = await prisma.expiryThreshold.create({
        data: {
          scope: 'PRODUCT',
          productId,
          warningDays: 18,
          effectiveFrom: new Date('2026-03-05'),
          effectiveTo: null,
          createdBy: userId,
        },
      });
      createdThresholdIds.push(replacement.id);
      expect(replacement.id).toBeDefined();
    } finally {
      await prisma.expiryThreshold.deleteMany({
        where: { id: { in: createdThresholdIds } },
      });
    }
  });

  // AC3.10
  it('từ chối giá trị trạng thái và action_type ngoài danh sách cho phép', async () => {
    await expect(
      prisma.user.create({
        data: {
          username: `test_t004_bad_status_${Date.now()}`,
          email: `test_t004_bad_status_${Date.now()}@kho-ai.local`,
          passwordHash: '$2b$10$placeholderhashfortestingconstraints000000000000000000',
          fullName: 'Trạng thái sai',
          status: 'deleted',
        },
      }),
    ).rejects.toThrow(/chk_users_status/);

    await expect(
      prisma.inboundReceipt.create({
        data: {
          receiptNo: `TEST_T004_PN_BADST_${Date.now()}`,
          supplierId,
          receiptDate: new Date('2026-01-10'),
          status: 'approved',
          createdBy: userId,
        },
      }),
    ).rejects.toThrow(/chk_inbound_receipts_status/);

    await expect(
      prisma.treatmentProposal.create({
        data: {
          riskAssessmentId,
          lotId,
          actionType: 'DISCOUNT',
          proposedQty: new Prisma.Decimal('5'),
          rationale: 'Action không được phép theo D-015',
          sourceRunId: analysisRunId,
          status: 'new',
          snapshot: {},
        },
      }),
    ).rejects.toThrow(/chk_treatment_proposals_action_type/);
  });

  // Ràng buộc bổ sung trọng yếu theo đặc tả
  it('từ chối inbound_receipts trạng thái confirmed thiếu confirmed_by hoặc confirmed_at', async () => {
    await expect(
      prisma.inboundReceipt.create({
        data: {
          receiptNo: `TEST_T004_PN_BADCONF_${Date.now()}`,
          supplierId,
          receiptDate: new Date('2026-01-10'),
          status: 'confirmed',
          createdBy: userId,
          confirmedBy: null,
          confirmedAt: null,
        },
      }),
    ).rejects.toThrow(/chk_inbound_receipts_confirmed_fields/);
  });

  it('từ chối stock_movements có quantity_delta = 0', async () => {
    await expect(
      prisma.stockMovement.create({
        data: {
          lotId,
          movementType: 'ADJUSTMENT',
          quantityDelta: new Prisma.Decimal('0'),
          balanceAfter: new Prisma.Decimal('10'),
          sourceType: 'STOCK_COUNT',
          sourceId: stockCountId,
          actorUserId: userId,
        },
      }),
    ).rejects.toThrow(/chk_stock_movements_quantity_delta/);
  });

  it('từ chối stock_count_items có variance_qty không bằng counted_qty - system_qty', async () => {
    await expect(
      prisma.stockCountItem.create({
        data: {
          countId: stockCountId,
          lotId,
          systemQty: new Prisma.Decimal('50'),
          countedQty: new Prisma.Decimal('48'),
          varianceQty: new Prisma.Decimal('2'),
        },
      }),
    ).rejects.toThrow(/chk_stock_count_items_variance_qty/);
  });

  // AC4
  it('từ chối xóa sản phẩm đang có lô hàng tham chiếu (FK ON DELETE RESTRICT)', async () => {
    await expect(
      prisma.product.delete({
        where: { id: productId },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});
