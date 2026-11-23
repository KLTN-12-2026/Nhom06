import { addCalendarDays } from '../../src/modules/ai/risk/domain/lot-risk.domain';
import { buildMonthKeys } from '../../src/modules/reports/domain/stock-ledger.domain';

export interface HistoricalCycleItemPlan {
  productCode: string;
  lotCode: string;
  expiryDate: string;
  manufacturedDate: string;
  quantity: number;
  unitCost: number;
}

export interface HistoricalCyclePlan {
  monthKey: string;
  batchIndex: 1 | 2;
  supplierCode: string;
  agencyCode: string;
  inboundDate: string;
  inboundConfirmedAtIso: string;
  outboundDate: string;
  outboundConfirmedAtIso: string;
  items: HistoricalCycleItemPlan[];
}

export interface DemoActiveLotPlan {
  productCode: string;
  supplierCode: string;
  lotCode: string;
  receiptDate: string;
  confirmedAtIso: string;
  manufacturedDate: string;
  expiryDate: string;
  quantity: number;
  unitCost: number;
}

export interface DemoPendingOrderPlan {
  agencyCode: string;
  orderDate: string;
  notes: string;
  items: Array<{ productCode: string; requestedQty: number }>;
}

export interface DemoPartialOrderPlan {
  agencyCode: string;
  orderDate: string;
  shipDate: string;
  shipConfirmedAtIso: string;
  notes: string;
  items: Array<{ productCode: string; requestedQty: number }>;
  shippedItems: Array<{ productCode: string; lotCode: string; quantity: number }>;
}

export interface DemoStockCountPlan {
  countedAtIso: string;
  approvedAtIso: string;
  note: string;
  items: Array<{
    productCode: string;
    lotCode: string;
    countedQty: number;
    reason?: string;
  }>;
}

export interface DemoPlan {
  anchorDate: string;
  monthKeys: string[];
  firstHistoryDate: string;
  historicalCycles: HistoricalCyclePlan[];
  activeLots: DemoActiveLotPlan[];
  stockCount: DemoStockCountPlan;
  pendingOrders: DemoPendingOrderPlan[];
  partialOrder: DemoPartialOrderPlan;
}

const PRODUCT_UNIT_COSTS: Record<string, number> = {
  SP001: 215000,
  SP002: 188000,
  SP003: 320000,
  SP004: 245000,
  SP005: 195000,
  SP006: 140000,
  SP007: 145000,
  SP008: 155000,
  SP009: 165000,
  SP010: 165000,
  SP011: 95000,
  SP012: 175000,
  SP013: 180000,
  SP014: 235000,
  SP015: 210000,
  SP016: 265000,
  SP017: 190000,
  SP018: 150000,
  SP019: 170000,
  SP020: 145000,
};

const PRODUCT_SUPPLIER: Record<string, string> = {
  SP001: 'NCC001',
  SP002: 'NCC001',
  SP003: 'NCC001',
  SP004: 'NCC003',
  SP005: 'NCC003',
  SP006: 'NCC001',
  SP007: 'NCC001',
  SP008: 'NCC003',
  SP009: 'NCC003',
  SP010: 'NCC003',
  SP011: 'NCC002',
  SP012: 'NCC002',
  SP013: 'NCC002',
  SP014: 'NCC002',
  SP015: 'NCC002',
  SP016: 'NCC003',
  SP017: 'NCC003',
  SP018: 'NCC003',
  SP019: 'NCC001',
  SP020: 'NCC001',
};

function toVnIsoTimestamp(isoDate: string, timeHms: string): string {
  return `${isoDate}T${timeHms}+07:00`;
}

function getDaysInMonth(monthKey: string): number {
  const [yStr, mStr] = monthKey.split('-');
  return new Date(Date.UTC(Number(yStr), Number(mStr), 0)).getUTCDate();
}

function buildClampedMonthDate(monthKey: string, desiredDay: number, maxDate: string): string {
  const maxDayOfMonth = getDaysInMonth(monthKey);
  const clampedDay = Math.max(1, Math.min(desiredDay, maxDayOfMonth));
  const candidate = `${monthKey}-${String(clampedDay).padStart(2, '0')}`;
  if (candidate <= maxDate) {
    return candidate;
  }
  const monthStart = `${monthKey}-01`;
  return maxDate >= monthStart ? maxDate : monthStart;
}

/**
 * Sinh kế hoạch dữ liệu demo hoàn toàn tất định, neo theo ngày hiện tại VN `anchorDate` (YYYY-MM-DD).
 * Đảm bảo đúng cấu trúc 12 tháng lịch sử + 40 lô còn hàng + 3 đơn chờ + 1 đơn xuất một phần + 1 kiểm kê.
 */
export function buildDemoPlan(anchorDate: string): DemoPlan {
  const monthKeys = buildMonthKeys(anchorDate, 12);
  const firstHistoryDate = `${monthKeys[0]}-01`;

  // 1. Lịch sử nhập — xuất 12 tháng cho SP001..SP010 (mỗi tháng 2 đợt, xuất hết 100% để không làm phình 40 lô hiện tại)
  const historicalCycles: HistoricalCyclePlan[] = [];
  const batchProducts: Record<1 | 2, readonly string[]> = {
    1: ['SP001', 'SP002', 'SP003', 'SP004', 'SP005'],
    2: ['SP006', 'SP007', 'SP008', 'SP009', 'SP010'],
  };
  const agencies = ['DL001', 'DL002', 'DL003', 'DL004', 'DL005'] as const;

  monthKeys.forEach((monthKey, monthIdx) => {
    const isCurrentMonth = monthIdx === monthKeys.length - 1;
    const seasonalFactor = 0.85 + 0.15 * Math.sin(((monthIdx + 1) / 12) * Math.PI * 2);
    const compactMonth = monthKey.replace('-', '');

    ([1, 2] as const).forEach((batchIndex) => {
      let inboundDate: string;
      let outboundDate: string;

      if (!isCurrentMonth) {
        inboundDate = buildClampedMonthDate(monthKey, batchIndex === 1 ? 4 : 15, anchorDate);
        outboundDate = buildClampedMonthDate(monthKey, batchIndex === 1 ? 9 : 21, anchorDate);
      } else {
        const anchorDay = Number(anchorDate.slice(8, 10));
        if (anchorDay <= 2) {
          // Trường hợp ngày mùng 1 hoặc mùng 2 đầu tháng: gói gọn trong [monthStart, anchorDate]
          inboundDate = `${monthKey}-01`;
          outboundDate = anchorDate;
        } else if (batchIndex === 1) {
          inboundDate = buildClampedMonthDate(monthKey, 1, addCalendarDays(anchorDate, -2));
          outboundDate = buildClampedMonthDate(
            monthKey,
            Math.max(2, Math.floor(anchorDay / 2)),
            addCalendarDays(anchorDate, -1),
          );
        } else {
          const inDay = Math.max(2, anchorDay - 2);
          inboundDate = buildClampedMonthDate(monthKey, inDay, addCalendarDays(anchorDate, -2));
          outboundDate = buildClampedMonthDate(
            monthKey,
            Math.max(inDay, anchorDay - 1),
            addCalendarDays(anchorDate, -1),
          );
        }
      }

      if (outboundDate < inboundDate) {
        outboundDate = inboundDate;
      }

      const inboundTime = batchIndex === 1 ? '08:15:00' : '09:15:00';
      const outboundTime = batchIndex === 1 ? '13:30:00' : '15:00:00';

      const items: HistoricalCycleItemPlan[] = batchProducts[batchIndex].map((productCode, idx) => {
        const baseQty = 80 + ((monthIdx * 13 + idx * 17 + batchIndex * 11) % 65);
        const qty = Math.round(baseQty * seasonalFactor);
        const shelfBufferDays = batchIndex === 1 ? 150 : 40;
        return {
          productCode,
          lotCode: `HIST-${compactMonth}-B${batchIndex}-${productCode}`,
          manufacturedDate: addCalendarDays(inboundDate, -10),
          expiryDate: addCalendarDays(outboundDate, shelfBufferDays),
          quantity: qty,
          unitCost: PRODUCT_UNIT_COSTS[productCode],
        };
      });

      historicalCycles.push({
        monthKey,
        batchIndex,
        supplierCode: batchIndex === 1 ? 'NCC001' : 'NCC003',
        agencyCode: agencies[(monthIdx * 2 + batchIndex) % agencies.length],
        inboundDate,
        inboundConfirmedAtIso: toVnIsoTimestamp(inboundDate, inboundTime),
        outboundDate,
        outboundConfirmedAtIso: toVnIsoTimestamp(outboundDate, outboundTime),
        items,
      });
    });
  });

  // 2. Đúng 40 lô đang còn tồn (tất cả có đơn giá)
  const makeLot = (
    productCode: string,
    lotCode: string,
    receiptOffsetDays: number,
    expiryOffsetDays: number,
    quantity: number,
    unitCostOverride?: number,
  ): DemoActiveLotPlan => {
    const receiptDate = addCalendarDays(anchorDate, receiptOffsetDays);
    const expiryDate = addCalendarDays(anchorDate, expiryOffsetDays);
    const manufacturedDate = addCalendarDays(receiptDate, -15);
    return {
      productCode,
      supplierCode: PRODUCT_SUPPLIER[productCode],
      lotCode,
      receiptDate,
      confirmedAtIso: toVnIsoTimestamp(receiptDate, '10:00:00'),
      manufacturedDate,
      expiryDate,
      quantity,
      unitCost: unitCostOverride ?? PRODUCT_UNIT_COSTS[productCode],
    };
  };

  const activeLots: DemoActiveLotPlan[] = [
    // --- 4 lô đã hết hạn của SP002 (quá 7–53 ngày → expired / critical → DISPOSE) ---
    makeLot('SP002', 'DEMO-SP002-EXP1', -180, -53, 80, 185000),
    makeLot('SP002', 'DEMO-SP002-EXP2', -170, -35, 65, 185000),
    makeLot('SP002', 'DEMO-SP002-EXP3', -160, -19, 50, 185000),
    makeLot('SP002', 'DEMO-SP002-EXP4', -155, -7, 45, 185000),

    // --- 1 lô cận hạn 8 ngày của SP002 (PRODUCT override 10 ngày → warning / high → CONTACT_AGENCY) ---
    makeLot('SP002', 'DEMO-SP002-NEAR', -145, 8, 220, 188000),

    // --- 2 lô cận hạn 20 ngày của SP004 & SP007 (risk medium → PRIORITIZE_FEFO) ---
    // SP004 đặt tồn 560 để tồn dư ước tính luôn > 120 (duyệt sẵn + ghi kết quả 120 đơn vị)
    makeLot('SP004', 'DEMO-SP004-NEAR', -130, 20, 560, 245000),
    makeLot('SP007', 'DEMO-SP007-NEAR', -22, 20, 720, 145000),

    // --- 33 lô hạn dài trên SP001..SP020 (SUA > 45 ngày, nhóm khác > 30 ngày) ---
    // SP001 (2 lô; L1 sẽ được kiểm kê điều chỉnh -5 thùng → còn 145)
    makeLot('SP001', 'DEMO-SP001-L1', -20, 95, 150),
    makeLot('SP001', 'DEMO-SP001-L2', -8, 150, 130),
    // SP002 (2 lô hạn dài bổ sung cho minh họa FEFO sau lô 8 ngày)
    makeLot('SP002', 'DEMO-SP002-L1', -18, 90, 120),
    makeLot('SP002', 'DEMO-SP002-L2', -6, 145, 110),
    // SP003 (2 lô; L1 xuất hiện trong phiếu kiểm kê không chênh)
    makeLot('SP003', 'DEMO-SP003-L1', -25, 180, 120),
    makeLot('SP003', 'DEMO-SP003-L2', -10, 260, 100),
    // SP004 (2 lô hạn dài)
    makeLot('SP004', 'DEMO-SP004-L1', -14, 105, 110),
    makeLot('SP004', 'DEMO-SP004-L2', -5, 155, 95),
    // SP005 (2 lô; L1 sẽ xuất 30 thùng cho đơn partial → còn 110)
    makeLot('SP005', 'DEMO-SP005-L1', -16, 115, 140),
    makeLot('SP005', 'DEMO-SP005-L2', -7, 165, 110),
    // SP006..SP010 (nhóm Sữa chua, ngưỡng chung 30 ngày → đặt HSD 36..42 ngày, normal & chân thực)
    makeLot('SP006', 'DEMO-SP006-L1', -5, 36, 110),
    makeLot('SP006', 'DEMO-SP006-L2', -3, 41, 100),
    makeLot('SP007', 'DEMO-SP007-L1', -4, 38, 95),
    makeLot('SP008', 'DEMO-SP008-L1', -5, 37, 105),
    makeLot('SP008', 'DEMO-SP008-L2', -2, 42, 90),
    makeLot('SP009', 'DEMO-SP009-L1', -4, 39, 115),
    makeLot('SP009', 'DEMO-SP009-L2', -2, 42, 95),
    makeLot('SP010', 'DEMO-SP010-L1', -3, 40, 110),
    // SP011..SP015 (nhóm Nước giải khát, 2 lô/SP cho SP011..SP013, 1 lô/SP cho SP014..SP015 → 8 lô)
    makeLot('SP011', 'DEMO-SP011-L1', -20, 210, 160),
    makeLot('SP011', 'DEMO-SP011-L2', -9, 300, 140),
    makeLot('SP012', 'DEMO-SP012-L1', -18, 175, 120),
    makeLot('SP012', 'DEMO-SP012-L2', -7, 240, 110),
    makeLot('SP013', 'DEMO-SP013-L1', -15, 200, 130),
    makeLot('SP013', 'DEMO-SP013-L2', -6, 270, 115),
    makeLot('SP014', 'DEMO-SP014-L1', -12, 220, 105),
    makeLot('SP015', 'DEMO-SP015-L1', -11, 185, 100),
    // SP016..SP020 (nhóm Bánh kẹo → 7 lô)
    makeLot('SP016', 'DEMO-SP016-L1', -19, 190, 95),
    makeLot('SP016', 'DEMO-SP016-L2', -8, 250, 85),
    makeLot('SP017', 'DEMO-SP017-L1', -14, 160, 90),
    makeLot('SP017', 'DEMO-SP017-L2', -6, 210, 80),
    makeLot('SP018', 'DEMO-SP018-L1', -12, 230, 100),
    makeLot('SP019', 'DEMO-SP019-L1', -10, 170, 95),
    makeLot('SP020', 'DEMO-SP020-L1', -7, 195, 90),
  ];

  // 3. 1 phiếu kiểm kê đã duyệt có chênh lệch (ngày D - 3)
  const stockCountDate = addCalendarDays(anchorDate, -3);
  const stockCount: DemoStockCountPlan = {
    countedAtIso: toVnIsoTimestamp(stockCountDate, '09:00:00'),
    approvedAtIso: toVnIsoTimestamp(stockCountDate, '10:30:00'),
    note: 'Kiểm kê định kỳ khu vực hàng sữa tươi và sữa đặc',
    items: [
      {
        productCode: 'SP001',
        lotCode: 'DEMO-SP001-L1',
        countedQty: 145,
        reason: 'Hư hỏng 5 thùng trong quá trình bốc xếp tại khu A',
      },
      {
        productCode: 'SP003',
        lotCode: 'DEMO-SP003-L1',
        countedQty: 120,
      },
    ],
  };

  // 4. 3 đơn đại lý chờ xuất (confirmed) + 1 đơn đã xuất một phần (partial)
  const pendingOrders: DemoPendingOrderPlan[] = [
    {
      agencyCode: 'DL001',
      orderDate: addCalendarDays(anchorDate, -1),
      notes: 'Đơn giao gấp — ưu tiên kiểm tra FEFO mặt hàng sữa tươi SP002',
      items: [
        { productCode: 'SP002', requestedQty: 50 },
        { productCode: 'SP001', requestedQty: 30 },
      ],
    },
    {
      agencyCode: 'DL002',
      orderDate: addCalendarDays(anchorDate, -1),
      notes: 'Đơn định kỳ giữa tuần của Cửa hàng Tổng hợp Thanh Khê',
      items: [
        { productCode: 'SP004', requestedQty: 40 },
        { productCode: 'SP006', requestedQty: 25 },
      ],
    },
    {
      agencyCode: 'DL003',
      orderDate: anchorDate,
      notes: 'Đơn bổ sung cuối tuần Đại lý An Phú Sơn Trà',
      items: [
        { productCode: 'SP007', requestedQty: 30 },
        { productCode: 'SP011', requestedQty: 40 },
      ],
    },
  ];

  const partialShipDate = addCalendarDays(anchorDate, -1);
  const partialOrder: DemoPartialOrderPlan = {
    agencyCode: 'DL004',
    orderDate: addCalendarDays(anchorDate, -2),
    shipDate: partialShipDate,
    shipConfirmedAtIso: toVnIsoTimestamp(partialShipDate, '16:00:00'),
    notes: 'Đơn giao 2 đợt cho Siêu thị Mini Ngũ Hành Sơn (đã xuất đợt 1)',
    items: [
      { productCode: 'SP005', requestedQty: 60 },
      { productCode: 'SP008', requestedQty: 40 },
    ],
    shippedItems: [
      { productCode: 'SP005', lotCode: 'DEMO-SP005-L1', quantity: 30 },
    ],
  };

  return {
    anchorDate,
    monthKeys,
    firstHistoryDate,
    historicalCycles,
    activeLots,
    stockCount,
    pendingOrders,
    partialOrder,
  };
}
