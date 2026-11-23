import { Prisma, PrismaClient } from '@prisma/client';

export interface InventoryInvariantViolation {
  type: 'NEGATIVE_BALANCE' | 'BALANCE_MISMATCH' | 'MISSING_SOURCE' | 'INVALID_SOURCE_STATUS';
  lotId?: string;
  lotCode?: string;
  movementId?: string;
  detail: string;
}

export interface InventoryInvariantsReport {
  checkedLots: number;
  checkedMovements: number;
  violations: InventoryInvariantViolation[];
}

/**
 * Kiểm tra bất biến tồn kho toàn cục trên PostgreSQL thật (AGENTS.md mục 3, T-017 AC2):
 * 1. Với mọi lô: `inventory_lot_balances.on_hand_qty === SUM(stock_movements.quantity_delta)`.
 * 2. Không lô nào có `on_hand_qty < 0`.
 * 3. Mọi dòng `stock_movements` đều gắn chứng từ nguồn thật tồn tại và đã xác nhận/duyệt.
 */
export async function verifyInventoryInvariants(
  prisma: PrismaClient,
): Promise<InventoryInvariantsReport> {
  const violations: InventoryInvariantViolation[] = [];

  const [lots, movements] = await Promise.all([
    prisma.lot.findMany({
      select: {
        id: true,
        lotCode: true,
        balance: {
          select: { onHandQty: true },
        },
      },
    }),
    prisma.stockMovement.findMany({
      select: {
        id: true,
        lotId: true,
        movementType: true,
        quantityDelta: true,
        sourceType: true,
        sourceId: true,
      },
    }),
  ]);

  const movementSumByLot = new Map<string, Prisma.Decimal>();
  const inboundSourceIds = new Set<string>();
  const outboundSourceIds = new Set<string>();
  const stockCountSourceIds = new Set<string>();

  for (const mv of movements) {
    const prev = movementSumByLot.get(mv.lotId) ?? new Prisma.Decimal(0);
    movementSumByLot.set(mv.lotId, prev.add(mv.quantityDelta));

    if (mv.sourceType === 'INBOUND_RECEIPT') {
      inboundSourceIds.add(mv.sourceId);
    } else if (mv.sourceType === 'OUTBOUND_RECEIPT') {
      outboundSourceIds.add(mv.sourceId);
    } else if (mv.sourceType === 'STOCK_COUNT') {
      stockCountSourceIds.add(mv.sourceId);
    } else {
      violations.push({
        type: 'MISSING_SOURCE',
        movementId: mv.id.toString(),
        lotId: mv.lotId,
        detail: `Loại chứng từ nguồn không hợp lệ: ${mv.sourceType}`,
      });
    }
  }

  for (const lot of lots) {
    const onHand = lot.balance?.onHandQty ?? new Prisma.Decimal(0);
    const sumDelta = movementSumByLot.get(lot.id) ?? new Prisma.Decimal(0);

    if (onHand.lt(0)) {
      violations.push({
        type: 'NEGATIVE_BALANCE',
        lotId: lot.id,
        lotCode: lot.lotCode,
        detail: `Lô ${lot.lotCode} có tồn âm: ${onHand.toString()}`,
      });
    }

    if (!onHand.eq(sumDelta)) {
      violations.push({
        type: 'BALANCE_MISMATCH',
        lotId: lot.id,
        lotCode: lot.lotCode,
        detail: `Lô ${lot.lotCode}: on_hand_qty=${onHand.toString()} !== SUM(quantity_delta)=${sumDelta.toString()}`,
      });
    }
  }

  const [inbounds, outbounds, stockCounts] = await Promise.all([
    inboundSourceIds.size > 0
      ? prisma.inboundReceipt.findMany({
          where: { id: { in: Array.from(inboundSourceIds) } },
          select: { id: true, status: true },
        })
      : Promise.resolve([]),
    outboundSourceIds.size > 0
      ? prisma.outboundReceipt.findMany({
          where: { id: { in: Array.from(outboundSourceIds) } },
          select: { id: true, status: true },
        })
      : Promise.resolve([]),
    stockCountSourceIds.size > 0
      ? prisma.stockCount.findMany({
          where: { id: { in: Array.from(stockCountSourceIds) } },
          select: { id: true, status: true },
        })
      : Promise.resolve([]),
  ]);

  const inboundStatusById = new Map(inbounds.map((r) => [r.id, r.status]));
  const outboundStatusById = new Map(outbounds.map((r) => [r.id, r.status]));
  const stockCountStatusById = new Map(stockCounts.map((r) => [r.id, r.status]));

  for (const mv of movements) {
    if (mv.sourceType === 'INBOUND_RECEIPT') {
      const status = inboundStatusById.get(mv.sourceId);
      if (!status) {
        violations.push({
          type: 'MISSING_SOURCE',
          movementId: mv.id.toString(),
          lotId: mv.lotId,
          detail: `Movement ${mv.id.toString()} trỏ tới inbound_receipt không tồn tại (${mv.sourceId})`,
        });
      } else if (status !== 'confirmed') {
        violations.push({
          type: 'INVALID_SOURCE_STATUS',
          movementId: mv.id.toString(),
          lotId: mv.lotId,
          detail: `Movement ${mv.id.toString()} trỏ tới inbound_receipt chưa xác nhận (status=${status})`,
        });
      }
    } else if (mv.sourceType === 'OUTBOUND_RECEIPT') {
      const status = outboundStatusById.get(mv.sourceId);
      if (!status) {
        violations.push({
          type: 'MISSING_SOURCE',
          movementId: mv.id.toString(),
          lotId: mv.lotId,
          detail: `Movement ${mv.id.toString()} trỏ tới outbound_receipt không tồn tại (${mv.sourceId})`,
        });
      } else if (status !== 'confirmed') {
        violations.push({
          type: 'INVALID_SOURCE_STATUS',
          movementId: mv.id.toString(),
          lotId: mv.lotId,
          detail: `Movement ${mv.id.toString()} trỏ tới outbound_receipt chưa xác nhận (status=${status})`,
        });
      }
    } else if (mv.sourceType === 'STOCK_COUNT') {
      const status = stockCountStatusById.get(mv.sourceId);
      if (!status) {
        violations.push({
          type: 'MISSING_SOURCE',
          movementId: mv.id.toString(),
          lotId: mv.lotId,
          detail: `Movement ${mv.id.toString()} trỏ tới stock_count không tồn tại (${mv.sourceId})`,
        });
      } else if (status !== 'approved') {
        violations.push({
          type: 'INVALID_SOURCE_STATUS',
          movementId: mv.id.toString(),
          lotId: mv.lotId,
          detail: `Movement ${mv.id.toString()} trỏ tới stock_count chưa duyệt (status=${status})`,
        });
      }
    }
  }

  return {
    checkedLots: lots.length,
    checkedMovements: movements.length,
    violations,
  };
}
