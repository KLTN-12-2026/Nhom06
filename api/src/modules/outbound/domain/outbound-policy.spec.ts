import { Prisma } from '@prisma/client';
import {
  appendCancelReasonToNotes,
  buildNextOrderNo,
  buildNextOutboundNo,
  computeOrderItemStatus,
  computeOrderStatus,
  groupOutboundItemsByLot,
  isPgConcurrencyConflictError,
  validateOrderItems,
  validateOutboundItems,
} from './outbound-policy';

describe('outbound-policy — hàm thuần validate đơn/xuất, sinh số chứng từ và bắt lỗi đồng thời', () => {
  it('sinh số đơn DHYYMMDDxxxx và số phiếu xuất PXYYMMDDxxxx tăng dần đúng chuẩn', () => {
    expect(buildNextOrderNo('2026-11-23', null)).toBe('DH2611230001');
    expect(buildNextOrderNo('2026-11-23', 'DH2611230009')).toBe('DH2611230010');
    expect(buildNextOrderNo('2026-11-23', 'DH2611239999')).toBe('DH26112310000');

    expect(buildNextOutboundNo('2026-11-23', null)).toBe('PX2611230001');
    expect(buildNextOutboundNo('2026-11-23', 'PX2611230042')).toBe('PX2611230043');
  });

  it('validateOrderItems: từ chối 0 dòng, ngày giả, số lượng <= 0 hoặc > 3 chữ số thập phân, và trùng sản phẩm', () => {
    const emptyRes = validateOrderItems('2026-11-23', []);
    expect(emptyRes.errors.map((e) => e.field)).toContain('items');

    const badRes = validateOrderItems('2026-02-30', [
      { productId: 'p1', requestedQty: '0' },
      { productId: 'p2', requestedQty: '-5' },
      { productId: 'p3', requestedQty: '1.2345' },
      { productId: 'p2', requestedQty: '10' },
    ]);
    expect(badRes.validItems).toHaveLength(0);
    expect(badRes.errors.map((e) => e.field)).toEqual(
      expect.arrayContaining([
        'orderDate',
        'items.0.requestedQty',
        'items.1.requestedQty',
        'items.2.requestedQty',
        'items.3.productId',
      ]),
    );
  });

  it('validateOutboundItems & groupOutboundItemsByLot: chống trùng (orderItemId, lotId) và sắp lotId tăng dần chống deadlock', () => {
    const dupRes = validateOutboundItems([
      { orderItemId: 'oi-1', lotId: 'lot-b', quantity: '10' },
      { orderItemId: 'oi-1', lotId: 'lot-b', quantity: '5' },
    ]);
    expect(dupRes.errors.map((e) => e.field)).toContain('items.1.lotId');

    const okRes = validateOutboundItems([
      { orderItemId: 'oi-2', lotId: 'lot-z', quantity: '12.5' },
      { orderItemId: 'oi-1', lotId: 'lot-a', quantity: '7.5' },
    ]);
    expect(okRes.errors).toHaveLength(0);

    const grouped = groupOutboundItemsByLot(okRes.validItems);
    expect(grouped.map((g) => g.lotId)).toEqual(['lot-a', 'lot-z']);
    expect(grouped[0].totalQuantity.toString()).toBe('7.5');
    expect(grouped[1].totalQuantity.toString()).toBe('12.5');
  });

  it('tính trạng thái dòng đơn, trạng thái đơn và nối lý do hủy không làm mất ghi chú cũ', () => {
    expect(computeOrderItemStatus(new Prisma.Decimal(100), new Prisma.Decimal(0))).toBe('pending');
    expect(computeOrderItemStatus(new Prisma.Decimal(100), new Prisma.Decimal(40))).toBe('partial');
    expect(computeOrderItemStatus(new Prisma.Decimal(100), new Prisma.Decimal(100))).toBe(
      'fulfilled',
    );

    expect(computeOrderStatus([{ status: 'fulfilled' }, { status: 'fulfilled' }])).toBe(
      'fulfilled',
    );
    expect(computeOrderStatus([{ status: 'fulfilled' }, { status: 'partial' }])).toBe('partial');

    expect(appendCancelReasonToNotes(null, 'Đại lý đổi lịch')).toBe('[Lý do hủy] Đại lý đổi lịch');
    expect(appendCancelReasonToNotes('Giao sáng', 'Hết xe')).toBe('Giao sáng\n[Lý do hủy] Hết xe');
  });

  it('nhận diện lỗi deadlock 40P01 / serialization 40001 / Prisma P2034 để trả 409 thay vì 500', () => {
    const p2034 = new Prisma.PrismaClientKnownRequestError('Write conflict', {
      code: 'P2034',
      clientVersion: '5.22.0',
    });
    const rawDeadlock = new Prisma.PrismaClientKnownRequestError('Raw query failed', {
      code: 'P2010',
      clientVersion: '5.22.0',
      meta: { code: '40P01', message: 'deadlock detected' },
    });
    const rawSerialization = { code: '40001', message: 'could not serialize access' };
    const otherErr = new Error('Some other failure');

    expect(isPgConcurrencyConflictError(p2034)).toBe(true);
    expect(isPgConcurrencyConflictError(rawDeadlock)).toBe(true);
    expect(isPgConcurrencyConflictError(rawSerialization)).toBe(true);
    expect(isPgConcurrencyConflictError(otherErr)).toBe(false);
  });
});
