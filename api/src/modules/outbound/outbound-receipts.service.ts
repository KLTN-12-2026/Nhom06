import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FieldValidationError } from '../../common/filters/http-exception.filter';
import { writeAuditLog } from '../../common/utils/audit-log.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalysisTriggerService } from '../ai/pipeline/analysis-trigger.service';
import { getVnTodayDateString } from '../expiry/domain/vn-date';
import { ExpiryThresholdsService } from '../expiry/expiry-thresholds.service';
import { formatUtcDate, isValidIsoDate } from '../inbound/domain/inbound-policy';
import {
  checkLotDeliveryEligibility,
  compareFefoLots,
  detectFefoBypassWarnings,
  FefoBypassWarning,
  FefoLotInput,
} from './domain/fefo';
import {
  buildNextOutboundNo,
  buildOutboundNoPrefix,
  computeOrderItemStatus,
  computeOrderStatus,
  groupOutboundItemsByLot,
  isPgConcurrencyConflictError,
  validateOutboundItems,
} from './domain/outbound-policy';
import { ConfirmOrderOutboundDto, ListOutboundReceiptsQueryDto } from './dto/outbound-receipt.dto';

export interface OutboundReceiptSummaryResponse {
  id: string;
  outboundNo: string;
  outboundType: string;
  status: string;
  order: {
    id: string;
    orderNo: string;
    agency: {
      id: string;
      code: string;
      name: string;
    };
  } | null;
  creator: {
    id: string;
    fullName: string;
  };
  confirmer: {
    id: string;
    fullName: string;
  } | null;
  confirmedAt: string | null;
  notes: string | null;
  lotCount: number;
  totalQuantity: string;
  matchedLotQty?: string;
  createdAt: string;
}

export interface OutboundReceiptItemResponse {
  id: string;
  orderItemId: string | null;
  lotId: string;
  lotCode: string;
  expiryDate: string;
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  quantity: string;
}

export interface OutboundReceiptDetailResponse extends OutboundReceiptSummaryResponse {
  items: OutboundReceiptItemResponse[];
}

export interface ConfirmOrderOutboundResponse extends OutboundReceiptDetailResponse {
  orderStatus: 'partial' | 'fulfilled';
  warnings: FefoBypassWarning[];
}

export interface OutboundReceiptListResponse {
  items: OutboundReceiptSummaryResponse[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LotDeductionInput {
  lotId: string;
  quantity: Prisma.Decimal;
}

export interface DeductLotsOptions {
  movementType: 'OUTBOUND' | 'RETURN' | 'DISPOSAL';
  sourceType: 'OUTBOUND_RECEIPT';
  sourceId: string;
  actorUserId: string;
  occurredAt: Date;
}

export interface DeductedLotResult {
  lotId: string;
  quantity: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  version: number;
}

interface OutboundStockMovementInput {
  lotId: string;
  movementType: 'OUTBOUND' | 'RETURN' | 'DISPOSAL';
  quantityDelta: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  sourceType: 'OUTBOUND_RECEIPT';
  sourceId: string;
  actorUserId: string;
  occurredAt: Date;
}

interface LockedOrderRow {
  id: string;
  order_no: string;
  agency_id: string;
  order_date: string;
  status: string;
}

interface LockedOrderItemRow {
  id: string;
  product_id: string;
  requested_qty: string;
  fulfilled_qty: string;
  status: string;
}

interface LockedLotRow {
  id: string;
  product_id: string;
  lot_code: string;
  expiry_date: string;
  received_at: string;
  status: string;
}

interface LockedBalanceRow {
  lot_id: string;
  on_hand_qty: string;
  version: number;
}

interface BalanceUpdateRow {
  balance_after: string;
  version: number;
}

const MAX_OUTBOUND_NO_RETRIES = 5;

const OUTBOUND_DETAIL_SELECT = {
  id: true,
  outboundNo: true,
  outboundType: true,
  status: true,
  confirmedAt: true,
  notes: true,
  createdAt: true,
  order: {
    select: {
      id: true,
      orderNo: true,
      agency: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  },
  creator: {
    select: {
      id: true,
      fullName: true,
    },
  },
  confirmer: {
    select: {
      id: true,
      fullName: true,
    },
  },
  items: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      orderItemId: true,
      lotId: true,
      quantity: true,
      lot: {
        select: {
          id: true,
          lotCode: true,
          expiryDate: true,
          product: {
            select: {
              id: true,
              code: true,
              name: true,
              unit: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.OutboundReceiptSelect;

type OutboundDetailRecord = Prisma.OutboundReceiptGetPayload<{
  select: typeof OUTBOUND_DETAIL_SELECT;
}>;

function toOutboundSummary(
  record: OutboundDetailRecord,
  matchedLotId?: string,
): OutboundReceiptSummaryResponse {
  let totalQty = new Prisma.Decimal(0);
  let matchedLotQty = new Prisma.Decimal(0);
  const uniqueLots = new Set<string>();
  for (const item of record.items) {
    totalQty = totalQty.add(item.quantity);
    uniqueLots.add(item.lotId);
    if (matchedLotId && item.lotId === matchedLotId) {
      matchedLotQty = matchedLotQty.add(item.quantity);
    }
  }

  return {
    id: record.id,
    outboundNo: record.outboundNo,
    outboundType: record.outboundType,
    status: record.status,
    order: record.order,
    creator: record.creator,
    confirmer: record.confirmer,
    confirmedAt: record.confirmedAt ? record.confirmedAt.toISOString() : null,
    notes: record.notes,
    lotCount: uniqueLots.size,
    totalQuantity: totalQty.toString(),
    ...(matchedLotId ? { matchedLotQty: matchedLotQty.toString() } : {}),
    createdAt: record.createdAt.toISOString(),
  };
}

function toOutboundDetail(record: OutboundDetailRecord): OutboundReceiptDetailResponse {
  return {
    ...toOutboundSummary(record),
    items: record.items.map((item) => ({
      id: item.id,
      orderItemId: item.orderItemId,
      lotId: item.lotId,
      lotCode: item.lot.lotCode,
      expiryDate: formatUtcDate(item.lot.expiryDate),
      product: item.lot.product,
      quantity: item.quantity.toString(),
    })),
  };
}

function isOutboundNoUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes('outbound_no');
  }
  if (typeof target === 'string') {
    return target.includes('outbound_no');
  }
  return false;
}

@Injectable()
export class OutboundReceiptsService {
  private readonly logger = new Logger(OutboundReceiptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly expiryThresholdsService: ExpiryThresholdsService,
    @Optional() private readonly analysisTrigger?: AnalysisTriggerService,
  ) {}

  async findAll(query: ListOutboundReceiptsQueryDto): Promise<OutboundReceiptListResponse> {
    if (query.from && !isValidIsoDate(query.from)) {
      throw new BadRequestException({
        message: 'Ngày bắt đầu không hợp lệ',
        errors: [{ field: 'from', message: 'Ngày bắt đầu không hợp lệ' }],
      });
    }
    if (query.to && !isValidIsoDate(query.to)) {
      throw new BadRequestException({
        message: 'Ngày kết thúc không hợp lệ',
        errors: [{ field: 'to', message: 'Ngày kết thúc không hợp lệ' }],
      });
    }
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException({
        message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc',
        errors: [{ field: 'from', message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc' }],
      });
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const where: Prisma.OutboundReceiptWhereInput = {};
    if (query.type) {
      where.outboundType = query.type;
    }
    if (query.orderId) {
      where.orderId = query.orderId;
    }
    if (query.lotId) {
      where.items = { some: { lotId: query.lotId } };
    }
    if (query.from || query.to) {
      where.confirmedAt = {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000+07:00`) } : {}),
        ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999+07:00`) } : {}),
      };
    }
    if (query.search) {
      where.OR = [
        { outboundNo: { contains: query.search, mode: 'insensitive' } },
        { order: { orderNo: { contains: query.search, mode: 'insensitive' } } },
        { order: { agency: { name: { contains: query.search, mode: 'insensitive' } } } },
        { order: { agency: { code: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    const [total, records] = await Promise.all([
      this.prisma.outboundReceipt.count({ where }),
      this.prisma.outboundReceipt.findMany({
        where,
        select: OUTBOUND_DETAIL_SELECT,
        orderBy: [{ confirmedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: records.map((record) => toOutboundSummary(record, query.lotId)),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: string): Promise<OutboundReceiptDetailResponse> {
    const record = await this.prisma.outboundReceipt.findUnique({
      where: { id },
      select: OUTBOUND_DETAIL_SELECT,
    });
    if (!record) {
      throw new NotFoundException('Không tìm thấy phiếu xuất kho');
    }
    return toOutboundDetail(record);
  }

  /**
   * Hàm trừ tồn kho nguyên tử theo từng lô đã khóa và ghi sổ biến động `stock_movements`.
   * Tách riêng để tái sử dụng cho phiếu xuất ORDER (T-009) và RETURN_TO_SUPPLIER / DISPOSAL (T-015).
   */
  async deductLotsInTransaction(
    tx: Prisma.TransactionClient,
    deductions: readonly LotDeductionInput[],
    options: DeductLotsOptions,
  ): Promise<DeductedLotResult[]> {
    const sorted = [...deductions].sort((a, b) => a.lotId.localeCompare(b.lotId));
    const results: DeductedLotResult[] = [];

    for (const item of sorted) {
      const qtySql = item.quantity.toFixed(3);
      const updatedRows = await tx.$queryRaw<BalanceUpdateRow[]>`
        UPDATE inventory_lot_balances
        SET on_hand_qty = on_hand_qty - ${qtySql}::numeric(14,3),
            version     = version + 1,
            updated_at  = NOW()
        WHERE lot_id = ${item.lotId}::uuid
          AND on_hand_qty >= ${qtySql}::numeric(14,3)
        RETURNING on_hand_qty::text AS balance_after, version
      `;

      if (updatedRows.length !== 1) {
        throw new ConflictException('Tồn không đủ');
      }

      const balanceAfter = new Prisma.Decimal(updatedRows[0].balance_after);
      await this.recordStockMovement(tx, {
        lotId: item.lotId,
        movementType: options.movementType,
        quantityDelta: item.quantity.neg(),
        balanceAfter,
        sourceType: options.sourceType,
        sourceId: options.sourceId,
        actorUserId: options.actorUserId,
        occurredAt: options.occurredAt,
      });

      results.push({
        lotId: item.lotId,
        quantity: item.quantity,
        balanceAfter,
        version: updatedRows[0].version,
      });
    }

    return results;
  }

  /**
   * Tạo và xác nhận phiếu xuất kho loại ORDER trong một DB transaction nguyên tử (skill stock-transaction):
   * 1. Khóa đơn & dòng đơn (FOR UPDATE) → kiểm trạng thái confirmed/partial.
   * 2. Gom theo lô và khóa lots + inventory_lot_balances theo lot_id ASC (chống deadlock).
   * 3. Kiểm lại toàn bộ điều kiện hợp lệ (D-023, sản phẩm khớp, tồn, phần còn thiếu) trong transaction.
   * 4. Tạo outbound_receipts (PX...) + outbound_receipt_items.
   * 5. Trừ tồn nguyên tử qua `deductLotsInTransaction` + ghi `stock_movements`.
   * 6. Upsert `order_lot_allocations` (`consumed`), cộng `fulfilled_qty`, chốt trạng thái đơn (điều kiện kép) + audit.
   */
  async confirmForOrder(
    orderId: string,
    dto: ConfirmOrderOutboundDto,
    actorUserId: string,
    internalOptions?: { confirmedAt?: Date },
  ): Promise<ConfirmOrderOutboundResponse> {
    const { validItems, errors: payloadErrors } = validateOutboundItems(dto.items);
    if (payloadErrors.length > 0) {
      throw new BadRequestException({
        message: payloadErrors[0].message,
        errors: payloadErrors,
      });
    }

    const confirmedAt = internalOptions?.confirmedAt ?? new Date();
    const evaluationDateStr = getVnTodayDateString(confirmedAt);
    const minDeliveryDays = await this.expiryThresholdsService.getMinDeliveryDays(evaluationDateStr);
    const outboundPrefix = buildOutboundNoPrefix(evaluationDateStr);

    for (let attempt = 0; attempt < MAX_OUTBOUND_NO_RETRIES; attempt += 1) {
      try {
        const result = await this.prisma.$transaction(
          async (tx) => {
            // Bước 1: Khóa bi quan đơn hàng và các dòng đơn
            const lockedOrders = await tx.$queryRaw<LockedOrderRow[]>`
              SELECT id, order_no, agency_id, order_date::text AS order_date, status
              FROM agency_orders
              WHERE id = ${orderId}::uuid
              FOR UPDATE
            `;
            const lockedOrder = lockedOrders[0];
            if (!lockedOrder) {
              throw new NotFoundException('Không tìm thấy đơn hàng đại lý');
            }
            if (lockedOrder.status !== 'confirmed' && lockedOrder.status !== 'partial') {
              throw new ConflictException(
                'Chỉ được xuất kho cho đơn hàng ở trạng thái chờ xuất hoặc xuất một phần',
              );
            }

            const lockedOrderItems = await tx.$queryRaw<LockedOrderItemRow[]>`
              SELECT id, product_id, requested_qty::text AS requested_qty,
                     fulfilled_qty::text AS fulfilled_qty, status
              FROM agency_order_items
              WHERE order_id = ${orderId}::uuid
              ORDER BY id ASC
              FOR UPDATE
            `;
            const orderItemMap = new Map(
              lockedOrderItems.map((row) => [
                row.id,
                {
                  id: row.id,
                  productId: row.product_id,
                  requestedQty: new Prisma.Decimal(row.requested_qty),
                  fulfilledQty: new Prisma.Decimal(row.fulfilled_qty),
                  status: row.status,
                },
              ]),
            );

            const badOrderItemErrors: FieldValidationError[] = [];
            for (const item of validItems) {
              if (!orderItemMap.has(item.orderItemId)) {
                badOrderItemErrors.push({
                  field: `items.${item.rowIndex}.orderItemId`,
                  message: 'Dòng đơn hàng không thuộc đơn đại lý này',
                });
              }
            }
            if (badOrderItemErrors.length > 0) {
              throw new BadRequestException({
                message: badOrderItemErrors[0].message,
                errors: badOrderItemErrors,
              });
            }

            // Bước 2: Gom theo lô và khóa lots + balances theo thứ tự lot_id ASC (chống deadlock)
            const groupedLots = groupOutboundItemsByLot(validItems);
            const lockedLotMap = new Map<string, LockedLotRow>();
            const lockedBalanceMap = new Map<string, Prisma.Decimal>();

            for (const group of groupedLots) {
              const lotRows = await tx.$queryRaw<LockedLotRow[]>`
                SELECT id, product_id, lot_code, expiry_date::text AS expiry_date,
                       received_at::text AS received_at, status
                FROM lots
                WHERE id = ${group.lotId}::uuid
                FOR UPDATE
              `;
              const lot = lotRows[0];
              if (!lot) {
                throw new BadRequestException({
                  message: 'Lô hàng không tồn tại',
                  errors: group.items.map((item) => ({
                    field: `items.${item.rowIndex}.lotId`,
                    message: 'Lô hàng không tồn tại',
                  })),
                });
              }
              lockedLotMap.set(lot.id, lot);

              const balRows = await tx.$queryRaw<LockedBalanceRow[]>`
                SELECT lot_id, on_hand_qty::text AS on_hand_qty, version
                FROM inventory_lot_balances
                WHERE lot_id = ${group.lotId}::uuid
                FOR UPDATE
              `;
              lockedBalanceMap.set(
                lot.id,
                balRows[0] ? new Prisma.Decimal(balRows[0].on_hand_qty) : new Prisma.Decimal(0),
              );
            }

            // Bước 3: Kiểm lại toàn bộ điều kiện nghiệp vụ bên trong transaction
            const productMismatchErrors: FieldValidationError[] = [];
            const conflictErrors: FieldValidationError[] = [];
            const requestedByOrderItem = new Map<string, Prisma.Decimal>();

            for (const item of validItems) {
              const orderItem = orderItemMap.get(item.orderItemId)!;
              const lot = lockedLotMap.get(item.lotId)!;
              const currentOnHand = lockedBalanceMap.get(item.lotId) ?? new Prisma.Decimal(0);

              if (lot.product_id !== orderItem.productId) {
                productMismatchErrors.push({
                  field: `items.${item.rowIndex}.lotId`,
                  message: `Lô ${lot.lot_code} không thuộc sản phẩm của dòng đơn hàng`,
                });
                continue;
              }

              const eligibility = checkLotDeliveryEligibility(
                {
                  id: lot.id,
                  lotCode: lot.lot_code,
                  expiryDate: lot.expiry_date,
                  receivedAt: lot.received_at,
                  status: lot.status,
                  onHandQty: currentOnHand,
                },
                evaluationDateStr,
                minDeliveryDays,
              );
              if (!eligibility.eligible) {
                conflictErrors.push({
                  field: `items.${item.rowIndex}.lotId`,
                  message: `Lô ${lot.lot_code} không đủ điều kiện giao: ${eligibility.reason}`,
                });
              }

              const prevSum = requestedByOrderItem.get(item.orderItemId) ?? new Prisma.Decimal(0);
              requestedByOrderItem.set(item.orderItemId, prevSum.add(item.quantity));
            }

            if (productMismatchErrors.length > 0) {
              throw new BadRequestException({
                message: productMismatchErrors[0].message,
                errors: productMismatchErrors,
              });
            }

            // Kiểm tổng xuất từng lô <= tồn hiện tại
            for (const group of groupedLots) {
              const lot = lockedLotMap.get(group.lotId)!;
              const currentOnHand = lockedBalanceMap.get(group.lotId) ?? new Prisma.Decimal(0);
              if (group.totalQuantity.gt(currentOnHand)) {
                conflictErrors.push({
                  field: `items.${group.items[0].rowIndex}.quantity`,
                  message: `Lô ${lot.lot_code} không đủ tồn khả dụng (hiện còn ${currentOnHand.toString()})`,
                });
              }
            }

            // Kiểm tổng xuất từng dòng đơn <= phần còn thiếu
            for (const [orderItemId, sumQty] of requestedByOrderItem.entries()) {
              const orderItem = orderItemMap.get(orderItemId)!;
              const remaining = orderItem.requestedQty.sub(orderItem.fulfilledQty);
              if (sumQty.gt(remaining)) {
                const firstRow = validItems.find((i) => i.orderItemId === orderItemId);
                conflictErrors.push({
                  field: firstRow ? `items.${firstRow.rowIndex}.quantity` : 'items',
                  message: `Số lượng xuất (${sumQty.toString()}) vượt quá phần còn thiếu của dòng đơn (${remaining.toString()})`,
                });
              }
            }

            if (conflictErrors.length > 0) {
              throw new ConflictException({
                message: conflictErrors[0].message,
                errors: conflictErrors,
              });
            }

            // Tính hạng FEFO và cảnh báo bỏ qua lô hạn sớm hơn còn tồn (không chặn)
            const affectedProductIds = Array.from(
              new Set(
                Array.from(requestedByOrderItem.keys()).map(
                  (oiId) => orderItemMap.get(oiId)!.productId,
                ),
              ),
            );
            const [productMetaRows, candidateLots] = await Promise.all([
              tx.product.findMany({
                where: { id: { in: affectedProductIds } },
                select: { id: true, code: true },
              }),
              tx.lot.findMany({
                where: { productId: { in: affectedProductIds }, status: 'active' },
                select: {
                  id: true,
                  productId: true,
                  lotCode: true,
                  expiryDate: true,
                  receivedAt: true,
                  status: true,
                  balance: { select: { onHandQty: true } },
                },
              }),
            ]);
            const productCodeById = new Map(productMetaRows.map((p) => [p.id, p.code]));
            const eligibleSortedByProduct = new Map<string, FefoLotInput[]>();

            for (const lot of candidateLots) {
              const onHand = lockedBalanceMap.get(lot.id) ?? lot.balance?.onHandQty ?? new Prisma.Decimal(0);
              const candidate: FefoLotInput = {
                id: lot.id,
                lotCode: lot.lotCode,
                expiryDate: formatUtcDate(lot.expiryDate),
                receivedAt: formatUtcDate(lot.receivedAt),
                status: lot.status,
                onHandQty: onHand,
              };
              const check = checkLotDeliveryEligibility(
                candidate,
                evaluationDateStr,
                minDeliveryDays,
              );
              if (check.eligible) {
                const list = eligibleSortedByProduct.get(lot.productId) ?? [];
                list.push(candidate);
                eligibleSortedByProduct.set(lot.productId, list);
              }
            }

            const fefoRankByLotId = new Map<string, number>();
            for (const list of eligibleSortedByProduct.values()) {
              list.sort(compareFefoLots);
              list.forEach((lot, idx) => {
                fefoRankByLotId.set(lot.id, idx + 1);
              });
            }

            const warnings: FefoBypassWarning[] = [];
            for (const orderItemId of requestedByOrderItem.keys()) {
              const orderItem = orderItemMap.get(orderItemId)!;
              const eligibleLots = eligibleSortedByProduct.get(orderItem.productId) ?? [];
              const chosenMap = new Map<string, Prisma.Decimal>();
              for (const item of validItems) {
                if (item.orderItemId === orderItemId) {
                  chosenMap.set(item.lotId, item.quantity);
                }
              }
              warnings.push(
                ...detectFefoBypassWarnings(eligibleLots, chosenMap, {
                  orderItemId,
                  productId: orderItem.productId,
                  productCode: productCodeById.get(orderItem.productId) ?? '',
                }),
              );
            }

            // Bước 4: Sinh số phiếu xuất PXYYMMDDxxxx & tạo chứng từ xuất
            const latestOutboundRows = await tx.$queryRaw<Array<{ outbound_no: string }>>`
              SELECT outbound_no
              FROM outbound_receipts
              WHERE outbound_no LIKE ${`${outboundPrefix}%`}
              ORDER BY char_length(outbound_no) DESC, outbound_no DESC
              LIMIT 1
            `;
            const outboundNo = buildNextOutboundNo(
              evaluationDateStr,
              latestOutboundRows[0]?.outbound_no ?? null,
            );

            const baseItemTime = confirmedAt.getTime();
            const receipt = await tx.outboundReceipt.create({
              data: {
                outboundNo,
                outboundType: 'ORDER',
                orderId: lockedOrder.id,
                status: 'confirmed',
                createdBy: actorUserId,
                confirmedBy: actorUserId,
                confirmedAt,
                notes: dto.notes ?? null,
                items: {
                  create: validItems.map((item, idx) => ({
                    orderItemId: item.orderItemId,
                    lotId: item.lotId,
                    quantity: item.quantity,
                    createdAt: new Date(baseItemTime + idx),
                  })),
                },
              },
              select: { id: true, outboundNo: true },
            });

            // Bước 5: Trừ tồn nguyên tử & ghi stock_movements cho từng lô (thứ tự lot_id ASC)
            await this.deductLotsInTransaction(
              tx,
              groupedLots.map((g) => ({ lotId: g.lotId, quantity: g.totalQuantity })),
              {
                movementType: 'OUTBOUND',
                sourceType: 'OUTBOUND_RECEIPT',
                sourceId: receipt.id,
                actorUserId,
                occurredAt: confirmedAt,
              },
            );

            // Bước 6: Upsert order_lot_allocations (cộng dồn nếu xuất nhiều lần cùng lô)
            for (const item of validItems) {
              const qtySql = item.quantity.toFixed(3);
              const rank = fefoRankByLotId.get(item.lotId) ?? 1;
              await tx.$executeRaw`
                INSERT INTO order_lot_allocations (
                  id, order_item_id, lot_id, allocated_qty, allocation_rank, status, allocated_at
                )
                VALUES (
                  gen_random_uuid(),
                  ${item.orderItemId}::uuid,
                  ${item.lotId}::uuid,
                  ${qtySql}::numeric(14,3),
                  ${rank},
                  'consumed',
                  ${confirmedAt}
                )
                ON CONFLICT (order_item_id, lot_id) DO UPDATE
                SET allocated_qty = order_lot_allocations.allocated_qty + EXCLUDED.allocated_qty,
                    status        = 'consumed',
                    allocated_at  = EXCLUDED.allocated_at
              `;
            }

            // Bước 7: Cập nhật fulfilled_qty từng dòng đơn và chốt trạng thái đơn (điều kiện kép)
            const finalItemStatuses: Array<{ status: string }> = [];
            let totalShippedQty = new Prisma.Decimal(0);

            for (const orderItem of orderItemMap.values()) {
              const delta = requestedByOrderItem.get(orderItem.id);
              if (!delta) {
                finalItemStatuses.push({ status: orderItem.status });
                continue;
              }
              const nextFulfilled = orderItem.fulfilledQty.add(delta);
              const nextItemStatus = computeOrderItemStatus(orderItem.requestedQty, nextFulfilled);
              await tx.agencyOrderItem.update({
                where: { id: orderItem.id },
                data: {
                  fulfilledQty: nextFulfilled,
                  status: nextItemStatus,
                },
              });
              finalItemStatuses.push({ status: nextItemStatus });
              totalShippedQty = totalShippedQty.add(delta);
            }

            const nextOrderStatus = computeOrderStatus(finalItemStatuses);
            const orderUpdate = await tx.agencyOrder.updateMany({
              where: { id: lockedOrder.id, status: { in: ['confirmed', 'partial'] } },
              data: { status: nextOrderStatus },
            });
            if (orderUpdate.count !== 1) {
              throw new ConflictException(
                'Trạng thái đơn hàng đã thay đổi, không thể xác nhận xuất kho',
              );
            }

            // Bước 8: Audit log
            await writeAuditLog(tx, {
              actorUserId,
              eventType: 'OUTBOUND_CONFIRMED',
              entityType: 'outbound_receipt',
              entityId: receipt.id,
              newData: {
                outboundNo: receipt.outboundNo,
                outboundType: 'ORDER',
                orderId: lockedOrder.id,
                orderNo: lockedOrder.order_no,
                orderStatusAfter: nextOrderStatus,
                lotCount: groupedLots.length,
                totalQuantity: totalShippedQty.toString(),
                warningsCount: warnings.length,
              },
            });

            // Bước 9: Đọc lại chi tiết phiếu xuất từ tx
            const detailRecord = await tx.outboundReceipt.findUniqueOrThrow({
              where: { id: receipt.id },
              select: OUTBOUND_DETAIL_SELECT,
            });

            return {
              ...toOutboundDetail(detailRecord),
              orderStatus: nextOrderStatus,
              warnings,
            };
          },
          { timeout: 10_000 },
        );

        // Hook sau commit (ngoài transaction): kích hoạt phân tích nền, không chặn response và không làm hỏng xác nhận
        try {
          this.analysisTrigger?.notifyStockChanged({
            sourceType: 'OUTBOUND_RECEIPT',
            sourceId: result.id,
            receiptNo: result.outboundNo,
          });
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Lỗi gọi hook STOCK_CHANGE sau xác nhận phiếu xuất ${result.outboundNo}: ${detail}`,
          );
        }

        return result;
      } catch (error) {
        if (isOutboundNoUniqueViolation(error) && attempt < MAX_OUTBOUND_NO_RETRIES - 1) {
          continue;
        }
        if (isPgConcurrencyConflictError(error)) {
          throw new ConflictException('Có thao tác khác đang xử lý cùng lô, vui lòng thử lại');
        }
        throw error;
      }
    }

    throw new ConflictException('Không thể sinh số phiếu xuất duy nhất, vui lòng thử lại');
  }

  protected async recordStockMovement(
    tx: Prisma.TransactionClient,
    input: OutboundStockMovementInput,
  ): Promise<void> {
    await tx.stockMovement.create({
      data: {
        lotId: input.lotId,
        movementType: input.movementType,
        quantityDelta: input.quantityDelta,
        balanceAfter: input.balanceAfter,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        actorUserId: input.actorUserId,
        occurredAt: input.occurredAt,
      },
    });
  }
}
