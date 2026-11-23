import { Prisma } from '@prisma/client';
import {
  computeMonthlyInOut,
  computeStockLedger,
  type StockLedgerMovementInput,
} from './stock-ledger.domain';

const PROD_A = { id: 'p-1', code: 'SP001', name: 'Sữa tươi 180ml', unit: 'Thùng' };
const PROD_B = { id: 'p-2', code: 'SP002', name: 'Sữa chua uống', unit: 'Lốc' };
const PROD_C = { id: 'p-3', code: 'SP003', name: 'Bánh quy', unit: 'Hộp' };

function mv(overrides: {
  product?: StockLedgerMovementInput['product'];
  occurredAt: string;
  movementType: StockLedgerMovementInput['movementType'];
  quantityDelta: string;
}): StockLedgerMovementInput {
  return {
    product: overrides.product ?? PROD_A,
    occurredAt: new Date(overrides.occurredAt),
    movementType: overrides.movementType,
    quantityDelta: new Prisma.Decimal(overrides.quantityDelta),
  };
}

describe('stock-ledger.domain (AC1)', () => {
  it('tính đúng opening, inbound, outbound, adjustment, closing với chuỗi movement hỗn hợp trước/trong/sau kỳ', () => {
    const movements: StockLedgerMovementInput[] = [
      // Trước kỳ (< 2026-11-01 00:00+07:00)
      mv({
        product: PROD_A,
        occurredAt: '2026-10-15T08:00:00+07:00',
        movementType: 'INBOUND',
        quantityDelta: '100.5',
      }),
      mv({
        product: PROD_A,
        occurredAt: '2026-10-20T10:00:00+07:00',
        movementType: 'OUTBOUND',
        quantityDelta: '-20.25',
      }),
      mv({
        product: PROD_A,
        occurredAt: '2026-10-25T15:00:00+07:00',
        movementType: 'ADJUSTMENT',
        quantityDelta: '-0.25',
      }),
      // Trong kỳ [2026-11-01, 2026-11-22]
      mv({
        product: PROD_A,
        occurredAt: '2026-11-01T00:00:00+07:00',
        movementType: 'INBOUND',
        quantityDelta: '50',
      }),
      mv({
        product: PROD_A,
        occurredAt: '2026-11-05T11:00:00+07:00',
        movementType: 'OUTBOUND',
        quantityDelta: '-30',
      }),
      mv({
        product: PROD_A,
        occurredAt: '2026-11-08T12:00:00+07:00',
        movementType: 'RETURN',
        quantityDelta: '-5',
      }),
      mv({
        product: PROD_A,
        occurredAt: '2026-11-10T14:00:00+07:00',
        movementType: 'DISPOSAL',
        quantityDelta: '-3.5',
      }),
      mv({
        product: PROD_A,
        occurredAt: '2026-11-12T09:00:00+07:00',
        movementType: 'ADJUSTMENT',
        quantityDelta: '4',
      }),
      mv({
        product: PROD_A,
        occurredAt: '2026-11-22T23:59:59+07:00',
        movementType: 'ADJUSTMENT',
        quantityDelta: '-1.5',
      }),
      // Sau kỳ (>= 2026-11-23 00:00+07:00) — phải bị bỏ qua
      mv({
        product: PROD_A,
        occurredAt: '2026-11-23T00:00:00+07:00',
        movementType: 'INBOUND',
        quantityDelta: '999',
      }),
      // SP002: chỉ có tồn đầu kỳ, không phát sinh giao dịch trong kỳ → vẫn phải hiện (AC3)
      mv({
        product: PROD_B,
        occurredAt: '2026-10-01T09:00:00+07:00',
        movementType: 'INBOUND',
        quantityDelta: '40',
      }),
      // SP003: nhập rồi xuất hết trước kỳ → cả 5 cột đều 0 → loại bỏ
      mv({
        product: PROD_C,
        occurredAt: '2026-10-01T09:00:00+07:00',
        movementType: 'INBOUND',
        quantityDelta: '10',
      }),
      mv({
        product: PROD_C,
        occurredAt: '2026-10-02T09:00:00+07:00',
        movementType: 'OUTBOUND',
        quantityDelta: '-10',
      }),
    ];

    const result = computeStockLedger(movements, '2026-11-01', '2026-11-22');

    expect(result.from).toBe('2026-11-01');
    expect(result.to).toBe('2026-11-22');
    expect(result.items).toHaveLength(2);

    const rowA = result.items[0];
    expect(rowA.product.code).toBe('SP001');
    expect(rowA.opening).toBe('80');
    expect(rowA.inbound).toBe('50');
    expect(rowA.outbound).toBe('38.5');
    expect(rowA.adjustment).toBe('2.5');
    // closing = 80 + 50 - 38.5 + 2.5 = 94
    expect(rowA.closing).toBe('94');

    const rowB = result.items[1];
    expect(rowB.product.code).toBe('SP002');
    expect(rowB.opening).toBe('40');
    expect(rowB.inbound).toBe('0');
    expect(rowB.outbound).toBe('0');
    expect(rowB.adjustment).toBe('0');
    expect(rowB.closing).toBe('40');

    expect(result.totals).toEqual({
      opening: '120',
      inbound: '50',
      outbound: '38.5',
      adjustment: '2.5',
      closing: '134',
    });
  });

  it('cắt ranh giới ngày chính xác theo múi giờ Việt Nam (UTC+7)', () => {
    const movements: StockLedgerMovementInput[] = [
      // 2026-10-31 16:59:59Z = 2026-10-31 23:59:59+07:00 → thuộc kỳ trước (opening)
      mv({
        occurredAt: '2026-10-31T16:59:59.000Z',
        movementType: 'INBOUND',
        quantityDelta: '10',
      }),
      // 2026-10-31 17:00:00Z = 2026-11-01 00:00:00+07:00 → thuộc trong kỳ (inbound)
      mv({
        occurredAt: '2026-10-31T17:00:00.000Z',
        movementType: 'INBOUND',
        quantityDelta: '25',
      }),
      // 2026-11-01 16:59:59Z = 2026-11-01 23:59:59+07:00 → thuộc trong kỳ (outbound)
      mv({
        occurredAt: '2026-11-01T16:59:59.000Z',
        movementType: 'OUTBOUND',
        quantityDelta: '-5',
      }),
      // 2026-11-01 17:00:00Z = 2026-11-02 00:00:00+07:00 → ngoài kỳ (bỏ qua)
      mv({
        occurredAt: '2026-11-01T17:00:00.000Z',
        movementType: 'INBOUND',
        quantityDelta: '100',
      }),
    ];

    const result = computeStockLedger(movements, '2026-11-01', '2026-11-01');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      opening: '10',
      inbound: '25',
      outbound: '5',
      adjustment: '0',
      closing: '30',
    });
  });

  it('trả về danh sách rỗng và tổng bằng 0 khi không có movement', () => {
    const result = computeStockLedger([], '2026-11-01', '2026-11-22');
    expect(result.items).toEqual([]);
    expect(result.totals).toEqual({
      opening: '0',
      inbound: '0',
      outbound: '0',
      adjustment: '0',
      closing: '0',
    });
  });

  it('gom biến động nhập/xuất đủ 12 tháng liên tục theo múi giờ Việt Nam', () => {
    const movements: StockLedgerMovementInput[] = [
      // Ngoài cửa sổ 12 tháng (2025-11)
      mv({
        occurredAt: '2025-11-20T10:00:00+07:00',
        movementType: 'INBOUND',
        quantityDelta: '999',
      }),
      // 2025-12
      mv({
        occurredAt: '2025-12-01T00:00:00+07:00',
        movementType: 'INBOUND',
        quantityDelta: '120',
      }),
      mv({
        occurredAt: '2025-12-15T10:00:00+07:00',
        movementType: 'OUTBOUND',
        quantityDelta: '-45',
      }),
      // 2026-10-31 18:00:00Z = 2026-11-01 01:00:00+07:00 → phải vào tháng 2026-11
      mv({
        occurredAt: '2026-10-31T18:00:00.000Z',
        movementType: 'INBOUND',
        quantityDelta: '80',
      }),
      mv({
        occurredAt: '2026-11-10T10:00:00+07:00',
        movementType: 'DISPOSAL',
        quantityDelta: '-10',
      }),
      mv({
        occurredAt: '2026-11-11T10:00:00+07:00',
        movementType: 'RETURN',
        quantityDelta: '-5',
      }),
      // Điều chỉnh không cộng vào nhập/xuất
      mv({
        occurredAt: '2026-11-12T10:00:00+07:00',
        movementType: 'ADJUSTMENT',
        quantityDelta: '50',
      }),
    ];

    const series = computeMonthlyInOut(movements, '2026-11-22', 12);
    expect(series).toHaveLength(12);
    expect(series[0]).toEqual({ month: '2025-12', inbound: '120', outbound: '45' });
    expect(series[1]).toEqual({ month: '2026-01', inbound: '0', outbound: '0' });
    expect(series[11]).toEqual({ month: '2026-11', inbound: '80', outbound: '15' });
  });
});
