import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FieldValidationError } from '../../common/filters/http-exception.filter';
import { writeAuditLog } from '../../common/utils/audit-log.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  classifyExpirySeverity,
  ExpirySeverity,
  selectApplicableThreshold,
  ThresholdRecord,
  ThresholdScope,
} from '../expiry/domain/expiry-policy';
import { formatDateOnly, getVnTodayDateString, parseIsoDateStrict } from '../expiry/domain/vn-date';
import { ExpiryThresholdsService } from '../expiry/expiry-thresholds.service';
import { formatUtcDate, isValidIsoDate, toUtcDate } from '../inbound/domain/inbound-policy';
import { checkLotDeliveryEligibility, planFefo } from './domain/fefo';
import {
  appendCancelReasonToNotes,
  buildNextOrderNo,
  buildOrderNoPrefix,
  NormalizedOrderItem,
  validateOrderItems,
} from './domain/outbound-policy';
import {
  CancelAgencyOrderDto,
  CreateAgencyOrderDto,
  ListAgencyOrdersQueryDto,
  UpdateAgencyOrderDto,
} from './dto/agency-order.dto';

export interface AgencyOrderSummaryResponse {
  id: string;
  orderNo: string;
  orderDate: string;
  status: string;
  notes: string | null;
  agency: {
    id: string;
    code: string;
    name: string;
  };
  creator: {
    id: string;
    fullName: string;
  };
  canceller: {
    id: string;
    fullName: string;
  } | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  lineCount: number;
  totalRequestedQty: string;
  totalFulfilledQty: string;
  totalRemainingQty: string;
}

export interface AgencyOrderItemDetailResponse {
  id: string;
  productId: string;
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  requestedQty: string;
  fulfilledQty: string;
  remainingQty: string;
  availableQty: string;
  status: string;
}

export interface OrderLinkedOutboundResponse {
  id: string;
  outboundNo: string;
  outboundType: string;
  status: string;
  confirmedAt: string | null;
  confirmer: {
    id: string;
    fullName: string;
  } | null;
  lotCount: number;
  totalQuantity: string;
}

export interface AgencyOrderDetailResponse extends AgencyOrderSummaryResponse {
  evaluationDate: string;
  minDeliveryDays: number;
  items: AgencyOrderItemDetailResponse[];
  outboundReceipts: OrderLinkedOutboundResponse[];
}

export interface AgencyOrderListResponse {
  items: AgencyOrderSummaryResponse[];
  total: number;
  page: number;
  pageSize: number;
  pendingCount: number;
}

export interface FefoPlanEligibleLotResponse {
  lotId: string;
  lotCode: string;
  expiryDate: string;
  receivedAt: string;
  daysRemaining: number;
  severity: ExpirySeverity;
  onHandQty: string;
  allocateQty: string;
  rank: number;
}

export interface FefoPlanExcludedLotResponse {
  lotId: string;
  lotCode: string;
  expiryDate: string;
  receivedAt: string;
  daysRemaining: number;
  severity: ExpirySeverity;
  onHandQty: string;
  reason: string;
}

export interface FefoPlanOrderItemResponse {
  orderItemId: string;
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  requestedQty: string;
  fulfilledQty: string;
  remainingQty: string;
  allocatedQty: string;
  shortageQty: string;
  lots: FefoPlanEligibleLotResponse[];
  excludedLots: FefoPlanExcludedLotResponse[];
}

export interface OrderFefoPlanResponse {
  orderId: string;
  orderNo: string;
  orderStatus: string;
  agency: {
    id: string;
    code: string;
    name: string;
  };
  evaluationDate: string;
  minDeliveryDays: number;
  totalRequestedQty: string;
  totalRemainingQty: string;
  totalAllocatedQty: string;
  totalShortageQty: string;
  items: FefoPlanOrderItemResponse[];
}

interface LockedOrderRow {
  id: string;
  order_no: string;
  agency_id: string;
  order_date: string;
  status: string;
  notes: string | null;
}

const MAX_ORDER_NO_RETRIES = 5;

const ORDER_DETAIL_SELECT = {
  id: true,
  orderNo: true,
  orderDate: true,
  status: true,
  notes: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  agency: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  creator: {
    select: {
      id: true,
      fullName: true,
    },
  },
  canceller: {
    select: {
      id: true,
      fullName: true,
    },
  },
  items: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      productId: true,
      requestedQty: true,
      fulfilledQty: true,
      status: true,
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
  outboundReceipts: {
    orderBy: [{ confirmedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      outboundNo: true,
      outboundType: true,
      status: true,
      confirmedAt: true,
      confirmer: {
        select: {
          id: true,
          fullName: true,
        },
      },
      items: {
        select: {
          lotId: true,
          quantity: true,
        },
      },
    },
  },
} satisfies Prisma.AgencyOrderSelect;

type OrderDetailRecord = Prisma.AgencyOrderGetPayload<{ select: typeof ORDER_DETAIL_SELECT }>;

function summarizeOrderQuantities(
  items: ReadonlyArray<{ requestedQty: Prisma.Decimal; fulfilledQty: Prisma.Decimal }>,
) {
  let totalRequested = new Prisma.Decimal(0);
  let totalFulfilled = new Prisma.Decimal(0);
  for (const item of items) {
    totalRequested = totalRequested.add(item.requestedQty);
    totalFulfilled = totalFulfilled.add(item.fulfilledQty);
  }
  const totalRemaining = Prisma.Decimal.max(
    new Prisma.Decimal(0),
    totalRequested.sub(totalFulfilled),
  );
  return {
    lineCount: items.length,
    totalRequestedQty: totalRequested.toString(),
    totalFulfilledQty: totalFulfilled.toString(),
    totalRemainingQty: totalRemaining.toString(),
  };
}

function toOrderSummary(record: OrderDetailRecord): AgencyOrderSummaryResponse {
  const summary = summarizeOrderQuantities(record.items);
  return {
    id: record.id,
    orderNo: record.orderNo,
    orderDate: formatUtcDate(record.orderDate),
    status: record.status,
    notes: record.notes,
    agency: record.agency,
    creator: record.creator,
    canceller: record.canceller,
    cancelledAt: record.cancelledAt ? record.cancelledAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    ...summary,
  };
}

function isOrderNoUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes('order_no');
  }
  if (typeof target === 'string') {
    return target.includes('order_no');
  }
  return false;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expiryThresholdsService: ExpiryThresholdsService,
  ) {}

  async findAll(query: ListAgencyOrdersQueryDto): Promise<AgencyOrderListResponse> {
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

    const where: Prisma.AgencyOrderWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.agencyId) {
      where.agencyId = query.agencyId;
    }
    if (query.from || query.to) {
      where.orderDate = {
        ...(query.from ? { gte: toUtcDate(query.from) } : {}),
        ...(query.to ? { lte: toUtcDate(query.to) } : {}),
      };
    }
    if (query.search) {
      where.OR = [
        { orderNo: { contains: query.search, mode: 'insensitive' } },
        { agency: { name: { contains: query.search, mode: 'insensitive' } } },
        { agency: { code: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [total, pendingCount, records] = await Promise.all([
      this.prisma.agencyOrder.count({ where }),
      this.prisma.agencyOrder.count({
        where: { status: { in: ['confirmed', 'partial'] } },
      }),
      this.prisma.agencyOrder.findMany({
        where,
        select: ORDER_DETAIL_SELECT,
        orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: records.map(toOrderSummary),
      total,
      page,
      pageSize,
      pendingCount,
    };
  }

  async findOne(id: string): Promise<AgencyOrderDetailResponse> {
    const record = await this.prisma.agencyOrder.findUnique({
      where: { id },
      select: ORDER_DETAIL_SELECT,
    });
    if (!record) {
      throw new NotFoundException('Không tìm thấy đơn hàng đại lý');
    }

    const evaluationDate = getVnTodayDateString();
    const minDeliveryDays = await this.expiryThresholdsService.getMinDeliveryDays(evaluationDate);
    const productIds = Array.from(new Set(record.items.map((item) => item.productId)));

    const lots =
      productIds.length > 0
        ? await this.prisma.lot.findMany({
            where: { productId: { in: productIds } },
            select: {
              id: true,
              productId: true,
              lotCode: true,
              expiryDate: true,
              receivedAt: true,
              status: true,
              balance: { select: { onHandQty: true } },
            },
          })
        : [];

    const availableByProduct = new Map<string, Prisma.Decimal>();
    for (const lot of lots) {
      const check = checkLotDeliveryEligibility(
        {
          id: lot.id,
          lotCode: lot.lotCode,
          expiryDate: formatUtcDate(lot.expiryDate),
          receivedAt: formatUtcDate(lot.receivedAt),
          status: lot.status,
          onHandQty: lot.balance?.onHandQty ?? new Prisma.Decimal(0),
        },
        evaluationDate,
        minDeliveryDays,
      );
      if (check.eligible) {
        const current = availableByProduct.get(lot.productId) ?? new Prisma.Decimal(0);
        availableByProduct.set(lot.productId, current.add(check.onHandQty));
      }
    }

    return {
      ...toOrderSummary(record),
      evaluationDate,
      minDeliveryDays,
      items: record.items.map((item) => {
        const remaining = Prisma.Decimal.max(
          new Prisma.Decimal(0),
          item.requestedQty.sub(item.fulfilledQty),
        );
        const available = availableByProduct.get(item.productId) ?? new Prisma.Decimal(0);
        return {
          id: item.id,
          productId: item.productId,
          product: {
            id: item.product.id,
            code: item.product.code,
            name: item.product.name,
            unit: item.product.unit,
          },
          requestedQty: item.requestedQty.toString(),
          fulfilledQty: item.fulfilledQty.toString(),
          remainingQty: remaining.toString(),
          availableQty: available.toString(),
          status: item.status,
        };
      }),
      outboundReceipts: record.outboundReceipts.map((receipt) => {
        let totalQty = new Prisma.Decimal(0);
        const uniqueLots = new Set<string>();
        for (const line of receipt.items) {
          totalQty = totalQty.add(line.quantity);
          uniqueLots.add(line.lotId);
        }
        return {
          id: receipt.id,
          outboundNo: receipt.outboundNo,
          outboundType: receipt.outboundType,
          status: receipt.status,
          confirmedAt: receipt.confirmedAt ? receipt.confirmedAt.toISOString() : null,
          confirmer: receipt.confirmer,
          lotCount: uniqueLots.size,
          totalQuantity: totalQty.toString(),
        };
      }),
    };
  }

  async create(
    dto: CreateAgencyOrderDto,
    actorUserId: string,
  ): Promise<AgencyOrderDetailResponse> {
    const normalizedItems = await this.validateOrderPayload(dto);
    const orderDateUtc = toUtcDate(dto.orderDate);
    const prefix = buildOrderNoPrefix(dto.orderDate);

    for (let attempt = 0; attempt < MAX_ORDER_NO_RETRIES; attempt += 1) {
      const latestRows = await this.prisma.$queryRaw<Array<{ order_no: string }>>`
        SELECT order_no
        FROM agency_orders
        WHERE order_no LIKE ${`${prefix}%`}
        ORDER BY char_length(order_no) DESC, order_no DESC
        LIMIT 1
      `;
      const orderNo = buildNextOrderNo(dto.orderDate, latestRows[0]?.order_no ?? null);

      try {
        const createdId = await this.prisma.$transaction(async (tx) => {
          const baseTime = Date.now();
          const created = await tx.agencyOrder.create({
            data: {
              orderNo,
              agencyId: dto.agencyId,
              orderDate: orderDateUtc,
              status: 'confirmed',
              createdBy: actorUserId,
              notes: dto.notes ?? null,
              items: {
                create: normalizedItems.map((item, idx) => ({
                  productId: item.productId,
                  requestedQty: item.requestedQty,
                  fulfilledQty: new Prisma.Decimal(0),
                  status: 'pending',
                  createdAt: new Date(baseTime + idx),
                })),
              },
            },
            select: { id: true, orderNo: true },
          });

          const totalRequested = normalizedItems.reduce(
            (acc, item) => acc.add(item.requestedQty),
            new Prisma.Decimal(0),
          );

          await writeAuditLog(tx, {
            actorUserId,
            eventType: 'ORDER_CREATED',
            entityType: 'agency_order',
            entityId: created.id,
            newData: {
              orderNo: created.orderNo,
              agencyId: dto.agencyId,
              orderDate: dto.orderDate,
              lineCount: normalizedItems.length,
              totalRequestedQty: totalRequested.toString(),
            },
          });

          return created.id;
        });

        return this.findOne(createdId);
      } catch (error) {
        if (isOrderNoUniqueViolation(error) && attempt < MAX_ORDER_NO_RETRIES - 1) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException('Không thể sinh số đơn hàng duy nhất, vui lòng thử lại');
  }

  async update(
    id: string,
    dto: UpdateAgencyOrderDto,
    actorUserId: string,
  ): Promise<AgencyOrderDetailResponse> {
    const normalizedItems = await this.validateOrderPayload(dto);
    const orderDateUtc = toUtcDate(dto.orderDate);

    await this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<LockedOrderRow[]>`
        SELECT id, order_no, agency_id, order_date::text AS order_date, status, notes
        FROM agency_orders
        WHERE id = ${id}::uuid
        FOR UPDATE
      `;
      const locked = lockedRows[0];
      if (!locked) {
        throw new NotFoundException('Không tìm thấy đơn hàng đại lý');
      }
      if (locked.status !== 'confirmed') {
        throw new ConflictException('Chỉ được sửa đơn hàng ở trạng thái chờ xuất chưa xuất kho');
      }

      const [fulfilledCount, outboundCount] = await Promise.all([
        tx.agencyOrderItem.count({
          where: { orderId: id, fulfilledQty: { gt: 0 } },
        }),
        tx.outboundReceipt.count({
          where: { orderId: id },
        }),
      ]);

      if (fulfilledCount > 0 || outboundCount > 0) {
        throw new ConflictException('Không thể sửa đơn hàng đã phát sinh xuất kho');
      }

      await tx.agencyOrderItem.deleteMany({ where: { orderId: id } });

      const baseTime = Date.now();
      await tx.agencyOrder.update({
        where: { id },
        data: {
          agencyId: dto.agencyId,
          orderDate: orderDateUtc,
          notes: dto.notes ?? null,
          items: {
            create: normalizedItems.map((item, idx) => ({
              productId: item.productId,
              requestedQty: item.requestedQty,
              fulfilledQty: new Prisma.Decimal(0),
              status: 'pending',
              createdAt: new Date(baseTime + idx),
            })),
          },
        },
      });

      const totalRequested = normalizedItems.reduce(
        (acc, item) => acc.add(item.requestedQty),
        new Prisma.Decimal(0),
      );

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'ORDER_UPDATED',
        entityType: 'agency_order',
        entityId: id,
        oldData: {
          agencyId: locked.agency_id,
          orderDate: locked.order_date,
        },
        newData: {
          orderNo: locked.order_no,
          agencyId: dto.agencyId,
          orderDate: dto.orderDate,
          lineCount: normalizedItems.length,
          totalRequestedQty: totalRequested.toString(),
        },
      });
    });

    return this.findOne(id);
  }

  async cancel(
    id: string,
    dto: CancelAgencyOrderDto,
    actorUserId: string,
  ): Promise<AgencyOrderDetailResponse> {
    const cleanReason = dto.reason.trim();
    if (!cleanReason) {
      throw new BadRequestException({
        message: 'Vui lòng nhập lý do hủy đơn hàng',
        errors: [{ field: 'reason', message: 'Vui lòng nhập lý do hủy đơn hàng' }],
      });
    }

    const cancelledAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<LockedOrderRow[]>`
        SELECT id, order_no, agency_id, order_date::text AS order_date, status, notes
        FROM agency_orders
        WHERE id = ${id}::uuid
        FOR UPDATE
      `;
      const locked = lockedRows[0];
      if (!locked) {
        throw new NotFoundException('Không tìm thấy đơn hàng đại lý');
      }
      if (locked.status !== 'confirmed' && locked.status !== 'partial') {
        throw new ConflictException(
          'Chỉ được hủy đơn hàng ở trạng thái chờ xuất hoặc xuất một phần',
        );
      }

      const nextNotes = appendCancelReasonToNotes(locked.notes, cleanReason);

      const updateRes = await tx.agencyOrder.updateMany({
        where: { id, status: { in: ['confirmed', 'partial'] } },
        data: {
          status: 'cancelled',
          cancelledBy: actorUserId,
          cancelledAt,
          notes: nextNotes,
        },
      });
      if (updateRes.count !== 1) {
        throw new ConflictException(
          'Chỉ được hủy đơn hàng ở trạng thái chờ xuất hoặc xuất một phần',
        );
      }

      // Chuyển các dòng chưa xuất gì sang cancelled; giữ nguyên dòng đã xuất đủ hoặc xuất một phần
      await tx.agencyOrderItem.updateMany({
        where: { orderId: id, status: 'pending' },
        data: { status: 'cancelled' },
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'ORDER_CANCELLED',
        entityType: 'agency_order',
        entityId: id,
        oldData: { status: locked.status },
        newData: {
          status: 'cancelled',
          orderNo: locked.order_no,
          reason: cleanReason,
        },
      });
    });

    return this.findOne(id);
  }

  /**
   * Tính gợi ý phân bổ lô theo FEFO cho đơn đại lý — CHỈ ĐỌC, tuyệt đối không ghi DB (Bất biến 1 & 5).
   */
  async getFefoPlan(id: string): Promise<OrderFefoPlanResponse> {
    const order = await this.prisma.agencyOrder.findUnique({
      where: { id },
      select: {
        id: true,
        orderNo: true,
        status: true,
        agency: { select: { id: true, code: true, name: true } },
        items: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            productId: true,
            requestedQty: true,
            fulfilledQty: true,
            status: true,
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

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng đại lý');
    }

    if (order.status !== 'confirmed' && order.status !== 'partial') {
      throw new ConflictException(
        'Đơn hàng đã xuất đủ hoặc đã hủy, không thể lập kế hoạch xuất kho',
      );
    }

    const evaluationDate = getVnTodayDateString();
    const evaluationDateObj = parseIsoDateStrict(evaluationDate);
    const productIds = Array.from(new Set(order.items.map((item) => item.productId)));

    const [minDeliveryDays, thresholdRows, allLots] = await Promise.all([
      this.expiryThresholdsService.getMinDeliveryDays(evaluationDate),
      this.expiryThresholdsService.loadEffectiveRowsAtDate(evaluationDateObj),
      productIds.length > 0
        ? this.prisma.lot.findMany({
            where: { productId: { in: productIds } },
            select: {
              id: true,
              productId: true,
              lotCode: true,
              expiryDate: true,
              receivedAt: true,
              status: true,
              balance: { select: { onHandQty: true } },
            },
          })
        : Promise.resolve([]),
    ]);

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

    const lotsByProduct = new Map<string, typeof allLots>();
    for (const lot of allLots) {
      const list = lotsByProduct.get(lot.productId) ?? [];
      list.push(lot);
      lotsByProduct.set(lot.productId, list);
    }

    let totalRequested = new Prisma.Decimal(0);
    let totalRemaining = new Prisma.Decimal(0);
    let totalAllocated = new Prisma.Decimal(0);
    let totalShortage = new Prisma.Decimal(0);

    const planItems: FefoPlanOrderItemResponse[] = order.items.map((item) => {
      const remainingQty = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        item.requestedQty.sub(item.fulfilledQty),
      );
      const productLots = (lotsByProduct.get(item.productId) ?? []).map((lot) => ({
        id: lot.id,
        lotCode: lot.lotCode,
        expiryDate: formatUtcDate(lot.expiryDate),
        receivedAt: formatUtcDate(lot.receivedAt),
        status: lot.status,
        onHandQty: lot.balance?.onHandQty ?? new Prisma.Decimal(0),
      }));

      const threshold = selectApplicableThreshold(
        domainThresholds,
        item.product.id,
        item.product.groupId,
        evaluationDate,
      );

      const fefo = planFefo(productLots, remainingQty, evaluationDate, minDeliveryDays);

      totalRequested = totalRequested.add(item.requestedQty);
      totalRemaining = totalRemaining.add(remainingQty);
      totalAllocated = totalAllocated.add(fefo.allocatedQty);
      totalShortage = totalShortage.add(fefo.shortageQty);

      return {
        orderItemId: item.id,
        product: {
          id: item.product.id,
          code: item.product.code,
          name: item.product.name,
          unit: item.product.unit,
        },
        requestedQty: item.requestedQty.toString(),
        fulfilledQty: item.fulfilledQty.toString(),
        remainingQty: remainingQty.toString(),
        allocatedQty: fefo.allocatedQty.toString(),
        shortageQty: fefo.shortageQty.toString(),
        lots: fefo.eligible.map((entry) => ({
          lotId: entry.lot.id,
          lotCode: entry.lot.lotCode,
          expiryDate: entry.lot.expiryDate,
          receivedAt: entry.lot.receivedAt,
          daysRemaining: entry.daysRemaining,
          severity: classifyExpirySeverity(
            entry.daysRemaining,
            threshold.warningDays,
            threshold.criticalDays,
          ),
          onHandQty: entry.onHandQty.toString(),
          allocateQty: entry.allocateQty.toString(),
          rank: entry.rank,
        })),
        excludedLots: fefo.excluded.map((entry) => ({
          lotId: entry.lot.id,
          lotCode: entry.lot.lotCode,
          expiryDate: entry.lot.expiryDate,
          receivedAt: entry.lot.receivedAt,
          daysRemaining: entry.daysRemaining,
          severity: classifyExpirySeverity(
            entry.daysRemaining,
            threshold.warningDays,
            threshold.criticalDays,
          ),
          onHandQty: entry.onHandQty.toString(),
          reason: entry.reason,
        })),
      };
    });

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      orderStatus: order.status,
      agency: order.agency,
      evaluationDate,
      minDeliveryDays,
      totalRequestedQty: totalRequested.toString(),
      totalRemainingQty: totalRemaining.toString(),
      totalAllocatedQty: totalAllocated.toString(),
      totalShortageQty: totalShortage.toString(),
      items: planItems,
    };
  }

  private async validateOrderPayload(dto: CreateAgencyOrderDto): Promise<NormalizedOrderItem[]> {
    const errors: FieldValidationError[] = [];
    const { validItems, errors: domainErrors } = validateOrderItems(dto.orderDate, dto.items);
    errors.push(...domainErrors);

    const uniqueProductIds = Array.from(new Set(dto.items.map((item) => item.productId)));

    const [agency, products] = await Promise.all([
      this.prisma.agency.findUnique({
        where: { id: dto.agencyId },
        select: { id: true, status: true },
      }),
      uniqueProductIds.length > 0
        ? this.prisma.product.findMany({
            where: { id: { in: uniqueProductIds } },
            select: { id: true, status: true },
          })
        : Promise.resolve([]),
    ]);

    if (!agency || agency.status !== 'active') {
      errors.push({
        field: 'agencyId',
        message: 'Đại lý không tồn tại hoặc đã ngừng hoạt động',
      });
    }

    const productStatusMap = new Map(products.map((p) => [p.id, p.status]));
    dto.items.forEach((item, index) => {
      const status = productStatusMap.get(item.productId);
      if (!status || status !== 'active') {
        errors.push({
          field: `items.${index}.productId`,
          message: 'Sản phẩm không tồn tại hoặc đã ngừng kinh doanh',
        });
      }
    });

    if (errors.length > 0) {
      throw new BadRequestException({
        message: errors[0].message,
        errors,
      });
    }

    return validItems;
  }
}
