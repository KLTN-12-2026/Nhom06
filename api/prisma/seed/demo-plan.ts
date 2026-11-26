import { addCalendarDays } from '../../src/modules/ai/risk/domain/lot-risk.domain';
import { diffCalendarDays } from '../../src/modules/expiry/domain/vn-date';
import { buildMonthKeys } from '../../src/modules/reports/domain/stock-ledger.domain';
import { PRODUCTS } from './catalog';

export interface DemoInboundLotItemPlan {
  productCode: string;
  lotCode: string;
  manufacturedDate: string;
  expiryDate: string;
  quantity: number;
  unitCost: number;
  isActiveLot: boolean;
}

export interface DemoInboundEventPlan {
  kind: 'INBOUND';
  date: string;
  occurredAtIso: string;
  supplierCode: string;
  notes: string;
  items: DemoInboundLotItemPlan[];
}

export interface DemoOutboundEventPlan {
  kind: 'OUTBOUND';
  date: string;
  occurredAtIso: string;
  agencyCode: string;
  monthKey: string;
  batchIndex: 1 | 2;
  notes: string;
  items: Array<{
    productCode: string;
    lotCode: string;
    quantity: number;
  }>;
}

export interface DemoStockCountEventPlan {
  kind: 'STOCK_COUNT';
  date: string;
  countedAtIso: string;
  occurredAtIso: string;
  note: string;
  items: Array<{
    productCode: string;
    lotCode: string;
    countedQty: number;
    reason?: string;
  }>;
}

export interface DemoPartialOrderEventPlan {
  kind: 'PARTIAL_ORDER';
  date: string;
  orderDate: string;
  occurredAtIso: string;
  agencyCode: string;
  notes: string;
  items: Array<{ productCode: string; requestedQty: number }>;
  shippedItems: Array<{ productCode: string; lotCode: string; quantity: number }>;
}

export type DemoTimelineEvent =
  | DemoInboundEventPlan
  | DemoOutboundEventPlan
  | DemoStockCountEventPlan
  | DemoPartialOrderEventPlan;

export interface DemoActiveLotPlan {
  productCode: string;
  supplierCode: string;
  lotCode: string;
  receiptDate: string;
  confirmedAtIso: string;
  manufacturedDate: string;
  expiryDate: string;
  initialQuantity: number;
  historicalShippedQty: number;
  /** Tồn cuối dự kiến tại ngày gốc `anchorDate` (sau xuất lịch sử, kiểm kê và đơn xuất một phần). */
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
  timeline: DemoTimelineEvent[];
  activeLots: DemoActiveLotPlan[];
  stockCount: DemoStockCountPlan;
  pendingOrders: DemoPendingOrderPlan[];
  partialOrder: DemoPartialOrderPlan;
}

const SHELF_LIFE_BY_CODE = new Map<string, number>(
  PRODUCTS.map((product) => [product.code, product.shelfLifeDays]),
);

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

interface ActiveLotSpec {
  productCode: string;
  lotCode: string;
  expiryOffsetDays: number;
  transitLagDays: number;
  /** Tồn mục tiêu trước kiểm kê (-5 cho SP001-L1) và trước đơn xuất một phần (-30 cho SP005-L1). */
  prePostQty: number;
  unitCostOverride?: number;
}

/**
 * 40 lô còn tồn giữ nguyên bộ mã DEMO-* (bao gồm DEMO-SP002-*, DEMO-SP004-NEAR, DEMO-SP007-NEAR).
 * Ngày sản xuất = HSD − shelfLifeDays; ngày nhận = ngày sản xuất + transitLagDays (2..15 ngày)
 * → tự nhiên rải đều ngày nhận qua 10–11 tháng gần nhất thay vì dồn vào tháng hiện tại.
 */
const ACTIVE_LOT_SPECS: readonly ActiveLotSpec[] = [
  // --- 4 lô đã hết hạn của SP002 (shelf=180 → nhận -225..-181 ngày, HSD quá 7–53 ngày → DISPOSE) ---
  { productCode: 'SP002', lotCode: 'DEMO-SP002-EXP1', expiryOffsetDays: -53, transitLagDays: 8, prePostQty: 80, unitCostOverride: 185000 },
  { productCode: 'SP002', lotCode: 'DEMO-SP002-EXP2', expiryOffsetDays: -35, transitLagDays: 8, prePostQty: 65, unitCostOverride: 185000 },
  { productCode: 'SP002', lotCode: 'DEMO-SP002-EXP3', expiryOffsetDays: -19, transitLagDays: 8, prePostQty: 50, unitCostOverride: 185000 },
  { productCode: 'SP002', lotCode: 'DEMO-SP002-EXP4', expiryOffsetDays: -7, transitLagDays: 6, prePostQty: 45, unitCostOverride: 185000 },

  // --- 1 lô cận hạn 8 ngày của SP002 (PRODUCT override 10 ngày → warning / high → CONTACT_AGENCY) ---
  { productCode: 'SP002', lotCode: 'DEMO-SP002-NEAR', expiryOffsetDays: 8, transitLagDays: 8, prePostQty: 220, unitCostOverride: 188000 },

  // --- 2 lô cận hạn 20 ngày của SP004 & SP007 (risk medium → PRIORITIZE_FEFO) ---
  // SP004 tồn 560 → tồn dư ước tính luôn > 120 để duyệt sẵn & ghi nhận 120 đơn vị
  { productCode: 'SP004', lotCode: 'DEMO-SP004-NEAR', expiryOffsetDays: 20, transitLagDays: 15, prePostQty: 560, unitCostOverride: 245000 },
  { productCode: 'SP007', lotCode: 'DEMO-SP007-NEAR', expiryOffsetDays: 20, transitLagDays: 3, prePostQty: 620, unitCostOverride: 145000 },

  // --- 33 lô hạn dài trên SP001..SP020 (SUA > 45 ngày, nhóm khác > 30 ngày) ---
  // SUA (SP001, SP002, SP004, SP005: 180 ngày; SP003: 365 ngày)
  { productCode: 'SP001', lotCode: 'DEMO-SP001-L1', expiryOffsetDays: 65, transitLagDays: 10, prePostQty: 150 },
  { productCode: 'SP001', lotCode: 'DEMO-SP001-L2', expiryOffsetDays: 142, transitLagDays: 10, prePostQty: 130 },
  { productCode: 'SP002', lotCode: 'DEMO-SP002-L1', expiryOffsetDays: 95, transitLagDays: 10, prePostQty: 120 },
  { productCode: 'SP002', lotCode: 'DEMO-SP002-L2', expiryOffsetDays: 152, transitLagDays: 10, prePostQty: 110 },
  { productCode: 'SP003', lotCode: 'DEMO-SP003-L1', expiryOffsetDays: 68, transitLagDays: 12, prePostQty: 120 },
  { productCode: 'SP003', lotCode: 'DEMO-SP003-L2', expiryOffsetDays: 285, transitLagDays: 12, prePostQty: 100 },
  { productCode: 'SP004', lotCode: 'DEMO-SP004-L1', expiryOffsetDays: 85, transitLagDays: 10, prePostQty: 110 },
  { productCode: 'SP004', lotCode: 'DEMO-SP004-L2', expiryOffsetDays: 145, transitLagDays: 10, prePostQty: 95 },
  { productCode: 'SP005', lotCode: 'DEMO-SP005-L1', expiryOffsetDays: 56, transitLagDays: 10, prePostQty: 140 },
  { productCode: 'SP005', lotCode: 'DEMO-SP005-L2', expiryOffsetDays: 132, transitLagDays: 10, prePostQty: 110 },

  // SUA_CHUA (45 ngày → nhận -6..0 ngày; 2 lô nhận sáng ngày D bảo đảm cột nhập tháng hiện tại > 0 cả ngày mùng 1)
  { productCode: 'SP006', lotCode: 'DEMO-SP006-L1', expiryOffsetDays: 36, transitLagDays: 3, prePostQty: 110 },
  { productCode: 'SP006', lotCode: 'DEMO-SP006-L2', expiryOffsetDays: 41, transitLagDays: 2, prePostQty: 100 },
  { productCode: 'SP007', lotCode: 'DEMO-SP007-L1', expiryOffsetDays: 38, transitLagDays: 3, prePostQty: 95 },
  { productCode: 'SP008', lotCode: 'DEMO-SP008-L1', expiryOffsetDays: 37, transitLagDays: 3, prePostQty: 105 },
  { productCode: 'SP008', lotCode: 'DEMO-SP008-L2', expiryOffsetDays: 42, transitLagDays: 2, prePostQty: 90 },
  { productCode: 'SP009', lotCode: 'DEMO-SP009-L1', expiryOffsetDays: 39, transitLagDays: 3, prePostQty: 115 },
  { productCode: 'SP009', lotCode: 'DEMO-SP009-L2', expiryOffsetDays: 42, transitLagDays: 3, prePostQty: 95 },
  { productCode: 'SP010', lotCode: 'DEMO-SP010-L1', expiryOffsetDays: 42, transitLagDays: 3, prePostQty: 110 },

  // NGK (SP011: 540, SP012: 300, SP013/SP014: 365, SP015: 270 ngày)
  { productCode: 'SP011', lotCode: 'DEMO-SP011-L1', expiryOffsetDays: 210, transitLagDays: 15, prePostQty: 160 },
  { productCode: 'SP011', lotCode: 'DEMO-SP011-L2', expiryOffsetDays: 475, transitLagDays: 15, prePostQty: 140 },
  { productCode: 'SP012', lotCode: 'DEMO-SP012-L1', expiryOffsetDays: 60, transitLagDays: 12, prePostQty: 120 },
  { productCode: 'SP012', lotCode: 'DEMO-SP012-L2', expiryOffsetDays: 260, transitLagDays: 12, prePostQty: 110 },
  { productCode: 'SP013', lotCode: 'DEMO-SP013-L1', expiryOffsetDays: 93, transitLagDays: 12, prePostQty: 130 },
  { productCode: 'SP013', lotCode: 'DEMO-SP013-L2', expiryOffsetDays: 322, transitLagDays: 12, prePostQty: 115 },
  { productCode: 'SP014', lotCode: 'DEMO-SP014-L1', expiryOffsetDays: 113, transitLagDays: 12, prePostQty: 105 },
  { productCode: 'SP015', lotCode: 'DEMO-SP015-L1', expiryOffsetDays: 185, transitLagDays: 10, prePostQty: 100 },

  // BANH_KEO (SP016/SP020: 300, SP017/SP019: 240, SP018: 365 ngày)
  { productCode: 'SP016', lotCode: 'DEMO-SP016-L1', expiryOffsetDays: 168, transitLagDays: 12, prePostQty: 95 },
  { productCode: 'SP016', lotCode: 'DEMO-SP016-L2', expiryOffsetDays: 266, transitLagDays: 12, prePostQty: 85 },
  { productCode: 'SP017', lotCode: 'DEMO-SP017-L1', expiryOffsetDays: 140, transitLagDays: 10, prePostQty: 90 },
  { productCode: 'SP017', lotCode: 'DEMO-SP017-L2', expiryOffsetDays: 212, transitLagDays: 10, prePostQty: 80 },
  { productCode: 'SP018', lotCode: 'DEMO-SP018-L1', expiryOffsetDays: 298, transitLagDays: 12, prePostQty: 100 },
  { productCode: 'SP019', lotCode: 'DEMO-SP019-L1', expiryOffsetDays: 180, transitLagDays: 10, prePostQty: 95 },
  { productCode: 'SP020', lotCode: 'DEMO-SP020-L1', expiryOffsetDays: 230, transitLagDays: 12, prePostQty: 90 },
];

const BATCH_DEFINITIONS: ReadonlyArray<{
  batchIndex: 1 | 2;
  inDay: number;
  outDay: number;
  products: readonly string[];
}> = [
  {
    batchIndex: 1,
    inDay: 4,
    outDay: 9,
    products: ['SP001', 'SP002', 'SP003', 'SP004', 'SP005', 'SP011', 'SP012', 'SP013', 'SP014', 'SP015'],
  },
  {
    batchIndex: 2,
    inDay: 15,
    outDay: 21,
    products: ['SP006', 'SP007', 'SP008', 'SP009', 'SP010', 'SP016', 'SP017', 'SP018', 'SP019', 'SP020'],
  },
];

const AGENCIES = ['DL001', 'DL002', 'DL003', 'DL004', 'DL005'] as const;
const MIN_DELIVERY_DAYS = 7;
const TARGET_MONTHLY_INBOUND = 2250;

/**
 * Tính trung vị của mảng số (dùng chung cho kiểm định phân bố nhập/xuất 12 tháng).
 */
export function computeMedian(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function toVnIsoTimestamp(isoDate: string, timeHms: string): string {
  return `${isoDate}T${timeHms}+07:00`;
}

function getDaysInMonth(monthKey: string): number {
  const [yStr, mStr] = monthKey.split('-');
  return new Date(Date.UTC(Number(yStr), Number(mStr), 0)).getUTCDate();
}

function formatDayInMonth(monthKey: string, day: number): string {
  const clamped = Math.max(1, Math.min(day, getDaysInMonth(monthKey)));
  return `${monthKey}-${String(clamped).padStart(2, '0')}`;
}

interface InternalActiveLot {
  productCode: string;
  supplierCode: string;
  lotCode: string;
  receiptDate: string;
  manufacturedDate: string;
  expiryDate: string;
  prePostQty: number;
  historicalShippedQty: number;
  unitCost: number;
}

interface RawInboundRecord {
  date: string;
  supplierCode: string;
  item: DemoInboundLotItemPlan;
}

interface YogurtSlot {
  monthIdx: number;
  batchIndex: 1 | 2;
  productIdx: number;
  inDate: string;
  outDate: string;
  productCode: string;
  lotCode: string;
  manufacturedDate: string;
  expiryDate: string;
  outboundKey: string;
}

const EVENT_PHASE_ORDER: Record<DemoTimelineEvent['kind'], number> = {
  INBOUND: 0,
  STOCK_COUNT: 1,
  OUTBOUND: 2,
  PARTIAL_ORDER: 3,
};

/**
 * Sinh kế hoạch dữ liệu demo tất định, neo theo ngày hiện tại VN `anchorDate` (YYYY-MM-DD):
 * - Rải ngày nhận 40 lô còn tồn theo đúng HSD và `shelf_life_days` (không tạo lô tương lai).
 * - Lịch sử xuất 12 tháng cho SP001..SP020 chạy trên cùng dòng thời gian và tiêu trực tiếp
 *   từ các lô còn tồn theo đúng thứ tự FEFO (0 vi phạm FEFO), giữ nhịp nhập/xuất cân bằng.
 */
export function buildDemoPlan(anchorDate: string): DemoPlan {
  const monthKeys = buildMonthKeys(anchorDate, 12);
  const firstHistoryDate = `${monthKeys[0]}-01`;
  const anchorDay = Number(anchorDate.slice(8, 10));

  // 1. Dựng 40 lô còn tồn với ngày sản xuất & ngày nhận suy trực tiếp từ HSD và shelf_life_days
  const internalActiveLots: InternalActiveLot[] = [];
  const earliestActiveReceiptByProduct = new Map<string, string>();

  for (const spec of ACTIVE_LOT_SPECS) {
    const shelfLife = SHELF_LIFE_BY_CODE.get(spec.productCode);
    if (!shelfLife) {
      throw new Error(`Không tìm thấy hạn dùng danh nghĩa cho sản phẩm ${spec.productCode}`);
    }
    const expiryDate = addCalendarDays(anchorDate, spec.expiryOffsetDays);
    const manufacturedDate = addCalendarDays(expiryDate, -shelfLife);
    const receiptDate = addCalendarDays(manufacturedDate, spec.transitLagDays);

    internalActiveLots.push({
      productCode: spec.productCode,
      supplierCode: PRODUCT_SUPPLIER[spec.productCode],
      lotCode: spec.lotCode,
      receiptDate,
      manufacturedDate,
      expiryDate,
      prePostQty: spec.prePostQty,
      historicalShippedQty: 0,
      unitCost: spec.unitCostOverride ?? PRODUCT_UNIT_COSTS[spec.productCode],
    });

    const prevEarliest = earliestActiveReceiptByProduct.get(spec.productCode);
    if (!prevEarliest || receiptDate < prevEarliest) {
      earliestActiveReceiptByProduct.set(spec.productCode, receiptDate);
    }
  }

  // 2. Lập lịch nhập–xuất 12 tháng (Pass 1: sản phẩm không phải sữa chua + tiêu FEFO trên lô đang hoạt động)
  const rawInbounds: RawInboundRecord[] = [];
  const outboundBatches = new Map<string, DemoOutboundEventPlan>();
  const yogurtSlotsByMonth = new Map<string, YogurtSlot[]>(monthKeys.map((mk) => [mk, []]));

  const ensureOutboundBatch = (params: {
    key: string;
    date: string;
    monthKey: string;
    batchIndex: 1 | 2;
    agencyCode: string;
  }): DemoOutboundEventPlan => {
    const existing = outboundBatches.get(params.key);
    if (existing) {
      return existing;
    }
    const timeHms = params.batchIndex === 1 ? '13:30:00' : '15:00:00';
    const created: DemoOutboundEventPlan = {
      kind: 'OUTBOUND',
      date: params.date,
      occurredAtIso: toVnIsoTimestamp(params.date, timeHms),
      agencyCode: params.agencyCode,
      monthKey: params.monthKey,
      batchIndex: params.batchIndex,
      notes: `Xuất kho lịch sử tháng ${params.monthKey} (đợt ${params.batchIndex})`,
      items: [],
    };
    outboundBatches.set(params.key, created);
    return created;
  };

  monthKeys.forEach((monthKey, monthIdx) => {
    const isCurrentMonth = monthIdx === monthKeys.length - 1;
    const seasonalFactor = 0.92 + 0.08 * Math.sin(((monthIdx + 1) / 12) * Math.PI * 2);
    const compactMonth = monthKey.replace('-', '');

    for (const batch of BATCH_DEFINITIONS) {
      let effInDay: number;
      let effOutDay: number;

      if (isCurrentMonth) {
        if (batch.batchIndex === 1) {
          effInDay = anchorDay <= 2 ? 1 : Math.min(batch.inDay, anchorDay - 2);
          effOutDay = anchorDay <= 2 ? anchorDay : Math.min(batch.outDay, anchorDay - 1);
        } else {
          if (anchorDay < 15) {
            continue;
          }
          effInDay = Math.min(batch.inDay, anchorDay - 2);
          effOutDay = Math.min(batch.outDay, anchorDay - 1);
        }
      } else {
        effInDay = batch.inDay;
        effOutDay = batch.outDay;
      }

      const inDate = formatDayInMonth(monthKey, effInDay);
      let outDate = formatDayInMonth(monthKey, effOutDay);
      if (outDate < inDate) {
        outDate = inDate;
      }

      const outboundKey = `${monthKey}::B${batch.batchIndex}`;
      const agencyCode = AGENCIES[(monthIdx * 2 + batch.batchIndex) % AGENCIES.length];

      batch.products.forEach((productCode, productIdx) => {
        const shelfLife = SHELF_LIFE_BY_CODE.get(productCode)!;
        const isYogurt = shelfLife === 45;

        // Kiểm xem sản phẩm đã có lô DEMO-* nào đủ điều kiện giao (FEFO) tại `outDate` chưa
        const eligibleActiveLots = internalActiveLots
          .filter(
            (lot) =>
              lot.productCode === productCode &&
              lot.receiptDate <= outDate &&
              diffCalendarDays(lot.expiryDate, outDate) >= MIN_DELIVERY_DAYS,
          )
          .sort(
            (a, b) =>
              a.expiryDate.localeCompare(b.expiryDate) ||
              a.receiptDate.localeCompare(b.receiptDate) ||
              a.lotCode.localeCompare(b.lotCode),
          );

        if (eligibleActiveLots.length > 0) {
          const chosen = eligibleActiveLots[0];
          const baseConsume = 50 + ((monthIdx * 7 + productIdx * 11) % 14);
          let consumeQty = baseConsume;
          if (chosen.lotCode === 'DEMO-SP004-NEAR') {
            consumeQty = 30;
          } else if (
            chosen.productCode === 'SP003' ||
            chosen.productCode === 'SP011' ||
            chosen.productCode === 'SP012' ||
            chosen.productCode === 'SP013' ||
            chosen.productCode === 'SP014'
          ) {
            consumeQty = 36;
          }

          chosen.historicalShippedQty += consumeQty;
          const outBatch = ensureOutboundBatch({
            key: outboundKey,
            date: outDate,
            monthKey,
            batchIndex: batch.batchIndex,
            agencyCode,
          });
          outBatch.items.push({
            productCode,
            lotCode: chosen.lotCode,
            quantity: consumeQty,
          });
          return;
        }

        // Trước khi lô DEMO-* đầu tiên về kho: tạo lô quay vòng lịch sử `HIST-*` đúng shelf_life_days
        const earliestReceipt = earliestActiveReceiptByProduct.get(productCode)!;
        if (outDate < earliestReceipt && inDate < earliestReceipt) {
          const transitLag = isYogurt ? 3 : 10;
          const manufacturedDate = addCalendarDays(inDate, -transitLag);
          const expiryDate = addCalendarDays(manufacturedDate, shelfLife);
          const lotCode = `HIST-${compactMonth}-B${batch.batchIndex}-${productCode}`;

          if (isYogurt) {
            yogurtSlotsByMonth.get(monthKey)!.push({
              monthIdx,
              batchIndex: batch.batchIndex,
              productIdx,
              inDate,
              outDate,
              productCode,
              lotCode,
              manufacturedDate,
              expiryDate,
              outboundKey,
            });
            ensureOutboundBatch({
              key: outboundKey,
              date: outDate,
              monthKey,
              batchIndex: batch.batchIndex,
              agencyCode,
            });
          } else {
            const baseQty = 52 + ((monthIdx * 13 + productIdx * 17 + batch.batchIndex * 11) % 18);
            const qty = Math.round(baseQty * seasonalFactor);
            rawInbounds.push({
              date: inDate,
              supplierCode: PRODUCT_SUPPLIER[productCode],
              item: {
                productCode,
                lotCode,
                manufacturedDate,
                expiryDate,
                quantity: qty,
                unitCost: PRODUCT_UNIT_COSTS[productCode],
                isActiveLot: false,
              },
            });
            const outBatch = ensureOutboundBatch({
              key: outboundKey,
              date: outDate,
              monthKey,
              batchIndex: batch.batchIndex,
              agencyCode,
            });
            outBatch.items.push({
              productCode,
              lotCode,
              quantity: qty,
            });
          }
        }
      });
    }
  });

  // 3. Pass 2: Cân sản lượng lô quay vòng sữa chua `HIST-*` theo tháng (khoảng 170..250 đv/SKU)
  //    để tổng nhập & tổng xuất từng tháng tự nhiên và ổn định sâu trong biên ±30%–±35% suốt 365 ngày.
  const nonYogurtInboundByMonth = new Map<string, number>(monthKeys.map((mk) => [mk, 0]));
  for (const rec of rawInbounds) {
    const mk = rec.date.slice(0, 7);
    if (nonYogurtInboundByMonth.has(mk)) {
      nonYogurtInboundByMonth.set(mk, nonYogurtInboundByMonth.get(mk)! + rec.item.quantity);
    }
  }
  for (const lot of internalActiveLots) {
    const mk = lot.receiptDate.slice(0, 7);
    const initialQuantity = lot.prePostQty + lot.historicalShippedQty;
    if (nonYogurtInboundByMonth.has(mk)) {
      nonYogurtInboundByMonth.set(mk, nonYogurtInboundByMonth.get(mk)! + initialQuantity);
    }
  }

  monthKeys.forEach((monthKey, monthIdx) => {
    const slots = yogurtSlotsByMonth.get(monthKey) ?? [];
    if (slots.length === 0) {
      return;
    }
    const seasonalFactor = 0.95 + 0.08 * Math.sin(((monthIdx + 1) / 12) * Math.PI * 2);
    const desiredMonthInbound = Math.round(TARGET_MONTHLY_INBOUND * seasonalFactor);
    const neededYogurt = desiredMonthInbound - (nonYogurtInboundByMonth.get(monthKey) ?? 0);
    const perSku = Math.max(170, Math.min(250, Math.round(neededYogurt / slots.length)));

    for (const slot of slots) {
      const jitter = ((monthIdx * 7 + slot.productIdx * 13) % 17) - 8;
      const qty = Math.max(150, perSku + jitter);
      rawInbounds.push({
        date: slot.inDate,
        supplierCode: PRODUCT_SUPPLIER[slot.productCode],
        item: {
          productCode: slot.productCode,
          lotCode: slot.lotCode,
          manufacturedDate: slot.manufacturedDate,
          expiryDate: slot.expiryDate,
          quantity: qty,
          unitCost: PRODUCT_UNIT_COSTS[slot.productCode],
          isActiveLot: false,
        },
      });
      outboundBatches.get(slot.outboundKey)!.items.push({
        productCode: slot.productCode,
        lotCode: slot.lotCode,
        quantity: qty,
      });
    }
  });

  // 4. Đưa 40 lô DEMO-* (với initialQuantity = prePostQty + historicalShippedQty) vào chung luồng nhập
  for (const lot of internalActiveLots) {
    rawInbounds.push({
      date: lot.receiptDate,
      supplierCode: lot.supplierCode,
      item: {
        productCode: lot.productCode,
        lotCode: lot.lotCode,
        manufacturedDate: lot.manufacturedDate,
        expiryDate: lot.expiryDate,
        quantity: lot.prePostQty + lot.historicalShippedQty,
        unitCost: lot.unitCost,
        isActiveLot: true,
      },
    });
  }

  // Gom các dòng nhập theo (date, supplierCode) để số lượng phiếu nhập gọn & thực tế
  const inboundGroups = new Map<string, DemoInboundEventPlan>();
  for (const rec of rawInbounds) {
    const groupKey = `${rec.date}::${rec.supplierCode}`;
    let group = inboundGroups.get(groupKey);
    if (!group) {
      // Lô nhận trong chính ngày anchorDate đặt mốc 00:05 VN để luôn <= thời điểm chạy thực tế
      const timeHms = rec.date === anchorDate ? '00:05:00' : '08:30:00';
      group = {
        kind: 'INBOUND',
        date: rec.date,
        occurredAtIso: toVnIsoTimestamp(rec.date, timeHms),
        supplierCode: rec.supplierCode,
        notes: `Nhập hàng đợt ${rec.date} từ ${rec.supplierCode}`,
        items: [],
      };
      inboundGroups.set(groupKey, group);
    }
    group.items.push(rec.item);
  }
  for (const group of inboundGroups.values()) {
    group.items.sort(
      (a, b) => a.productCode.localeCompare(b.productCode) || a.lotCode.localeCompare(b.lotCode),
    );
  }

  // 5. Đơn đã xuất một phần (D - 2 đặt đơn, D - 1 xuất 30 thùng SP005-L1)
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
    shippedItems: [{ productCode: 'SP005', lotCode: 'DEMO-SP005-L1', quantity: 30 }],
  };

  const partialOrderEvent: DemoPartialOrderEventPlan = {
    kind: 'PARTIAL_ORDER',
    date: partialOrder.shipDate,
    orderDate: partialOrder.orderDate,
    occurredAtIso: partialOrder.shipConfirmedAtIso,
    agencyCode: partialOrder.agencyCode,
    notes: partialOrder.notes,
    items: partialOrder.items,
    shippedItems: partialOrder.shippedItems,
  };

  // 6. Ghép dòng thời gian & tính chính xác tồn trước kiểm kê ngày D - 3 cho DEMO-SP001-L1 (-5) và DEMO-SP003-L1 (0)
  const stockCountDate = addCalendarDays(anchorDate, -3);
  const stockCountCountedAtIso = toVnIsoTimestamp(stockCountDate, '09:00:00');
  const stockCountApprovedAtIso = toVnIsoTimestamp(stockCountDate, '10:30:00');

  const baseEvents: DemoTimelineEvent[] = [
    ...inboundGroups.values(),
    ...Array.from(outboundBatches.values()).filter((b) => b.items.length > 0),
    partialOrderEvent,
  ];

  const compareTimelineEvents = (a: DemoTimelineEvent, b: DemoTimelineEvent): number => {
    const timeDiff = new Date(a.occurredAtIso).getTime() - new Date(b.occurredAtIso).getTime();
    if (timeDiff !== 0) {
      return timeDiff;
    }
    const phaseDiff = EVENT_PHASE_ORDER[a.kind] - EVENT_PHASE_ORDER[b.kind];
    if (phaseDiff !== 0) {
      return phaseDiff;
    }
    if (a.kind === 'INBOUND' && b.kind === 'INBOUND') {
      return a.supplierCode.localeCompare(b.supplierCode);
    }
    if (a.kind === 'OUTBOUND' && b.kind === 'OUTBOUND') {
      return a.batchIndex - b.batchIndex;
    }
    return 0;
  };

  baseEvents.sort(compareTimelineEvents);

  const stockCountApprovedMs = new Date(stockCountApprovedAtIso).getTime();
  const runningBalanceBeforeCount = new Map<string, number>();
  for (const event of baseEvents) {
    if (new Date(event.occurredAtIso).getTime() > stockCountApprovedMs) {
      break;
    }
    if (event.kind === 'INBOUND') {
      for (const item of event.items) {
        const key = `${item.productCode}::${item.lotCode}`;
        runningBalanceBeforeCount.set(key, (runningBalanceBeforeCount.get(key) ?? 0) + item.quantity);
      }
    } else if (event.kind === 'OUTBOUND' || event.kind === 'PARTIAL_ORDER') {
      const ships = event.kind === 'OUTBOUND' ? event.items : event.shippedItems;
      for (const ship of ships) {
        const key = `${ship.productCode}::${ship.lotCode}`;
        runningBalanceBeforeCount.set(key, (runningBalanceBeforeCount.get(key) ?? 0) - ship.quantity);
      }
    }
  }

  const sp001L1QtyBeforeCount = runningBalanceBeforeCount.get('SP001::DEMO-SP001-L1') ?? 150;
  const sp003L1QtyBeforeCount = runningBalanceBeforeCount.get('SP003::DEMO-SP003-L1') ?? 120;

  const stockCount: DemoStockCountPlan = {
    countedAtIso: stockCountCountedAtIso,
    approvedAtIso: stockCountApprovedAtIso,
    note: 'Kiểm kê định kỳ khu vực hàng sữa tươi và sữa đặc',
    items: [
      {
        productCode: 'SP001',
        lotCode: 'DEMO-SP001-L1',
        countedQty: sp001L1QtyBeforeCount - 5,
        reason: 'Hư hỏng 5 thùng trong quá trình bốc xếp tại khu A',
      },
      {
        productCode: 'SP003',
        lotCode: 'DEMO-SP003-L1',
        countedQty: sp003L1QtyBeforeCount,
      },
    ],
  };

  const stockCountEvent: DemoStockCountEventPlan = {
    kind: 'STOCK_COUNT',
    date: stockCountDate,
    countedAtIso: stockCount.countedAtIso,
    occurredAtIso: stockCount.approvedAtIso,
    note: stockCount.note,
    items: stockCount.items,
  };

  const timeline: DemoTimelineEvent[] = [...baseEvents, stockCountEvent].sort(compareTimelineEvents);

  // 7. Xuất danh sách 40 lô activeLots với tồn cuối chính xác tại anchorDate
  const activeLots: DemoActiveLotPlan[] = internalActiveLots.map((lot) => {
    let expectedEndingQty = lot.prePostQty;
    if (lot.lotCode === 'DEMO-SP001-L1') {
      expectedEndingQty -= 5;
    } else if (lot.lotCode === 'DEMO-SP005-L1') {
      expectedEndingQty -= 30;
    }
    const timeHms = lot.receiptDate === anchorDate ? '00:05:00' : '08:30:00';
    return {
      productCode: lot.productCode,
      supplierCode: lot.supplierCode,
      lotCode: lot.lotCode,
      receiptDate: lot.receiptDate,
      confirmedAtIso: toVnIsoTimestamp(lot.receiptDate, timeHms),
      manufacturedDate: lot.manufacturedDate,
      expiryDate: lot.expiryDate,
      initialQuantity: lot.prePostQty + lot.historicalShippedQty,
      historicalShippedQty: lot.historicalShippedQty,
      quantity: expectedEndingQty,
      unitCost: lot.unitCost,
    };
  });

  // 8. 3 đơn đại lý chờ xuất (confirmed)
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

  return {
    anchorDate,
    monthKeys,
    firstHistoryDate,
    timeline,
    activeLots,
    stockCount,
    pendingOrders,
    partialOrder,
  };
}
