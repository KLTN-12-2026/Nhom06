import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FieldValidationError } from '../../common/filters/http-exception.filter';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { writeAuditLog } from '../../common/utils/audit-log.util';
import { PrismaService } from '../../prisma/prisma.service';
import { formatDateOnly, getVnTodayDateString, parseIsoDateStrict } from '../expiry/domain/vn-date';
import { buildVnDayRangeUtc } from './domain/inventory-policy';
import {
  appendCancelReasonToNote,
  buildNextStockCountNo,
  buildStockCountNoPrefix,
  LotSnapshotForCount,
  sortStockCountItemsForLocking,
  StockCountStatus,
  summarizeStockCountItems,
  validateStockCountItems,
} from './domain/stock-count-policy';
import {
  CancelStockCountDto,
  ListStockCountsQueryDto,
  SaveStockCountDto,
} from './dto/stock-count.dto';

export interface StockCountSummaryResponse {
  id: string;
  countNo: string;
  status: StockCountStatus;
  countedAt: string;
  note: string | null;
  creator: {
    id: string;
    fullName: string;
  };
  approver: {
    id: string;
    fullName: string;
  } | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lineCount: number;
  discrepancyCount: number;
  totalVarianceQty: string;
}

export interface StockCountItemResponse {
  id: string;
  lotId: string;
  lotCode: string;
  lotStatus: string;
  expiryDate: string;
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  systemQty: string;
  countedQty: string;
  varianceQty: string;
  currentOnHandQty: string;
  hasBalanceDrift: boolean;
  reason: string | null;
}

export interface StockCountDetailResponse extends StockCountSummaryResponse {
  items: StockCountItemResponse[];
}

export interface StockCountListResponse {
  items: StockCountSummaryResponse[];
  total: number;
  page: number;
  pageSize: number;
}

interface LockedStockCountRow {
  id: string;
  count_no: string;
  status: string;
  counted_at: Date;
  created_by: string;
  note: string | null;
}

interface LockedLotRow {
  id: string;
  lot_code: string;
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

export interface StockCountMovementInput {
  lotId: string;
  quantityDelta: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  sourceId: string;
  actorUserId: string;
  occurredAt: Date;
}

const MAX_COUNT_NO_RETRIES = 5;

const STOCK_COUNT_DETAIL_SELECT = {
  id: true,
  countNo: true,
  status: true,
  countedAt: true,
  approvedAt: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  creator: {
    select: {
      id: true,
      fullName: true,
    },
  },
  approver: {
    select: {
      id: true,
      fullName: true,
    },
  },
  items: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      lotId: true,
      systemQty: true,
      countedQty: true,
      varianceQty: true,
      reason: true,
      lot: {
        select: {
          lotCode: true,
          status: true,
          expiryDate: true,
          product: {
            select: {
              id: true,
              code: true,
              name: true,
              unit: true,
            },
          },
          balance: {
            select: {
              onHandQty: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.StockCountSelect;

type StockCountDetailRecord = Prisma.StockCountGetPayload<{
  select: typeof STOCK_COUNT_DETAIL_SELECT;
}>;

function toStockCountSummary(record: StockCountDetailRecord): StockCountSummaryResponse {
  const summary = summarizeStockCountItems(record.items);
  return {
    id: record.id,
    countNo: record.countNo,
    status: record.status as StockCountStatus,
    countedAt: record.countedAt.toISOString(),
    note: record.note,
    creator: record.creator,
    approver: record.approver,
    approvedAt: record.approvedAt ? record.approvedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lineCount: summary.lineCount,
    discrepancyCount: summary.discrepancyCount,
    totalVarianceQty: summary.totalVarianceQty,
  };
}

function toStockCountDetail(record: StockCountDetailRecord): StockCountDetailResponse {
  return {
    ...toStockCountSummary(record),
    items: record.items.map((item) => {
      const currentOnHand = item.lot.balance ? item.lot.balance.onHandQty : new Prisma.Decimal(0);
      return {
        id: item.id,
        lotId: item.lotId,
        lotCode: item.lot.lotCode,
        lotStatus: item.lot.status,
        expiryDate: formatDateOnly(item.lot.expiryDate),
        product: item.lot.product,
        systemQty: item.systemQty.toString(),
        countedQty: item.countedQty.toString(),
        varianceQty: item.varianceQty.toString(),
        currentOnHandQty: currentOnHand.toString(),
        hasBalanceDrift:
          (record.status === 'draft' || record.status === 'submitted') &&
          !currentOnHand.eq(item.systemQty),
        reason: item.reason,
      };
    }),
  };
}

function isCountNoUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes('count_no');
  }
  if (typeof target === 'string') {
    return target.includes('count_no');
  }
  return false;
}

function parseCountedAtDate(raw: string): Date {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException({
      message: 'Thời điểm kiểm kê không hợp lệ',
      errors: [{ field: 'countedAt', message: 'Thời điểm kiểm kê không hợp lệ' }],
    });
  }
  return parsed;
}

function validateOptionalFilterDate(raw: string | undefined, field: string): void {
  if (!raw) {
    return;
  }
  try {
    parseIsoDateStrict(raw);
  } catch {
    throw new BadRequestException({
      message: 'Ngày lọc không hợp lệ',
      errors: [{ field, message: 'Ngày lọc phải đúng định dạng YYYY-MM-DD' }],
    });
  }
}

@Injectable()
export class StockCountsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListStockCountsQueryDto): Promise<StockCountListResponse> {
    validateOptionalFilterDate(query.from, 'from');
    validateOptionalFilterDate(query.to, 'to');
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException({
        message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc',
        errors: [
          {
            field: 'from',
            message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc',
          },
        ],
      });
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const where: Prisma.StockCountWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.from || query.to) {
      where.countedAt = buildVnDayRangeUtc(query.from, query.to);
    }
    if (query.search) {
      where.OR = [
        { countNo: { contains: query.search, mode: 'insensitive' } },
        { note: { contains: query.search, mode: 'insensitive' } },
        { creator: { fullName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [total, records] = await Promise.all([
      this.prisma.stockCount.count({ where }),
      this.prisma.stockCount.findMany({
        where,
        select: STOCK_COUNT_DETAIL_SELECT,
        orderBy: [{ countedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: records.map(toStockCountSummary),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: string): Promise<StockCountDetailResponse> {
    const record = await this.prisma.stockCount.findUnique({
      where: { id },
      select: STOCK_COUNT_DETAIL_SELECT,
    });
    if (!record) {
      throw new NotFoundException('Không tìm thấy phiếu kiểm kê');
    }
    return toStockCountDetail(record);
  }

  async create(dto: SaveStockCountDto, actorUserId: string): Promise<StockCountDetailResponse> {
    const countedAt = parseCountedAtDate(dto.countedAt);
    const uniqueLotIds = Array.from(new Set(dto.items.map((item) => item.lotId)));

    const lots = await this.prisma.lot.findMany({
      where: { id: { in: uniqueLotIds } },
      select: {
        id: true,
        status: true,
        balance: { select: { onHandQty: true } },
      },
    });

    const lotSnapshots = new Map<string, LotSnapshotForCount>(
      lots.map((lot) => [
        lot.id,
        {
          lotId: lot.id,
          status: lot.status,
          systemQty: lot.balance ? lot.balance.onHandQty : new Prisma.Decimal(0),
        },
      ]),
    );

    const { validItems, errors } = validateStockCountItems(dto.items, lotSnapshots);
    if (errors.length > 0) {
      throw new BadRequestException({
        message: errors[0].message,
        errors,
      });
    }

    const vnDateStr = getVnTodayDateString(countedAt);
    const prefix = buildStockCountNoPrefix(vnDateStr);

    for (let attempt = 0; attempt < MAX_COUNT_NO_RETRIES; attempt += 1) {
      const latestRows = await this.prisma.$queryRaw<Array<{ count_no: string }>>`
        SELECT count_no
        FROM stock_counts
        WHERE count_no LIKE ${`${prefix}%`}
        ORDER BY char_length(count_no) DESC, count_no DESC
        LIMIT 1
      `;
      const countNo = buildNextStockCountNo(vnDateStr, latestRows[0]?.count_no ?? null);

      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const baseItemTime = Date.now();
          const stockCount = await tx.stockCount.create({
            data: {
              countNo,
              status: 'draft',
              countedAt,
              createdBy: actorUserId,
              note: dto.note ?? null,
              items: {
                create: validItems.map((item, idx) => ({
                  lotId: item.lotId,
                  systemQty: item.systemQty,
                  countedQty: item.countedQty,
                  varianceQty: item.varianceQty,
                  reason: item.reason,
                  createdAt: new Date(baseItemTime + idx),
                })),
              },
            },
            select: STOCK_COUNT_DETAIL_SELECT,
          });

          const summary = summarizeStockCountItems(stockCount.items);
          await writeAuditLog(tx, {
            actorUserId,
            eventType: 'STOCK_COUNT_CREATED',
            entityType: 'stock_count',
            entityId: stockCount.id,
            newData: {
              countNo: stockCount.countNo,
              countedAt: stockCount.countedAt.toISOString(),
              lineCount: summary.lineCount,
              discrepancyCount: summary.discrepancyCount,
              totalVarianceQty: summary.totalVarianceQty,
            },
          });

          return stockCount;
        });

        return toStockCountDetail(created);
      } catch (error) {
        if (isCountNoUniqueViolation(error) && attempt < MAX_COUNT_NO_RETRIES - 1) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException('Không thể sinh số phiếu kiểm kê duy nhất, vui lòng thử lại');
  }

  async update(
    id: string,
    dto: SaveStockCountDto,
    actorUserId: string,
  ): Promise<StockCountDetailResponse> {
    const countedAt = parseCountedAtDate(dto.countedAt);

    const updated = await this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<LockedStockCountRow[]>`
        SELECT id, count_no, status, counted_at, created_by, note
        FROM stock_counts
        WHERE id = ${id}::uuid
        FOR UPDATE
      `;
      const locked = lockedRows[0];
      if (!locked) {
        throw new NotFoundException('Không tìm thấy phiếu kiểm kê');
      }
      if (locked.status !== 'draft') {
        throw new ConflictException('Chỉ được sửa phiếu kiểm kê ở trạng thái nháp');
      }

      const existingItems = await tx.stockCountItem.findMany({
        where: { countId: id },
        select: { lotId: true, systemQty: true },
      });
      const existingSystemQtyMap = new Map(
        existingItems.map((item) => [item.lotId, item.systemQty]),
      );

      const uniqueLotIds = Array.from(new Set(dto.items.map((item) => item.lotId)));
      const lots = await tx.lot.findMany({
        where: { id: { in: uniqueLotIds } },
        select: {
          id: true,
          status: true,
          balance: { select: { onHandQty: true } },
        },
      });

      // Giữ system_qty đã chụp cho lô đã có trong phiếu; làm mới từ tồn hiện tại cho lô mới thêm
      const lotSnapshots = new Map<string, LotSnapshotForCount>(
        lots.map((lot) => [
          lot.id,
          {
            lotId: lot.id,
            status: lot.status,
            systemQty:
              existingSystemQtyMap.get(lot.id) ??
              (lot.balance ? lot.balance.onHandQty : new Prisma.Decimal(0)),
          },
        ]),
      );

      const { validItems, errors } = validateStockCountItems(dto.items, lotSnapshots);
      if (errors.length > 0) {
        throw new BadRequestException({
          message: errors[0].message,
          errors,
        });
      }

      await tx.stockCountItem.deleteMany({ where: { countId: id } });

      const baseItemTime = Date.now();
      const stockCount = await tx.stockCount.update({
        where: { id },
        data: {
          countedAt,
          note: dto.note ?? null,
          items: {
            create: validItems.map((item, idx) => ({
              lotId: item.lotId,
              systemQty: item.systemQty,
              countedQty: item.countedQty,
              varianceQty: item.varianceQty,
              reason: item.reason,
              createdAt: new Date(baseItemTime + idx),
            })),
          },
        },
        select: STOCK_COUNT_DETAIL_SELECT,
      });

      const summary = summarizeStockCountItems(stockCount.items);
      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'STOCK_COUNT_UPDATED',
        entityType: 'stock_count',
        entityId: stockCount.id,
        oldData: {
          countedAt: locked.counted_at.toISOString(),
          lineCount: existingItems.length,
        },
        newData: {
          countNo: stockCount.countNo,
          countedAt: stockCount.countedAt.toISOString(),
          lineCount: summary.lineCount,
          discrepancyCount: summary.discrepancyCount,
          totalVarianceQty: summary.totalVarianceQty,
        },
      });

      return stockCount;
    });

    return toStockCountDetail(updated);
  }

  async submit(id: string, actorUserId: string): Promise<StockCountDetailResponse> {
    const submitted = await this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<LockedStockCountRow[]>`
        SELECT id, count_no, status, counted_at, created_by, note
        FROM stock_counts
        WHERE id = ${id}::uuid
        FOR UPDATE
      `;
      const locked = lockedRows[0];
      if (!locked) {
        throw new NotFoundException('Không tìm thấy phiếu kiểm kê');
      }
      if (locked.status !== 'draft') {
        throw new ConflictException('Chỉ được gửi duyệt phiếu kiểm kê ở trạng thái nháp');
      }

      const items = await tx.stockCountItem.findMany({
        where: { countId: id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: {
          lot: { select: { id: true, status: true } },
        },
      });

      const lotSnapshots = new Map<string, LotSnapshotForCount>(
        items.map((item) => [
          item.lotId,
          {
            lotId: item.lotId,
            status: item.lot.status,
            systemQty: item.systemQty,
          },
        ]),
      );

      const { errors } = validateStockCountItems(
        items.map((item) => ({
          lotId: item.lotId,
          countedQty: item.countedQty.toString(),
          reason: item.reason,
        })),
        lotSnapshots,
      );
      if (errors.length > 0) {
        throw new BadRequestException({
          message: errors[0].message,
          errors,
        });
      }

      const stockCount = await tx.stockCount.update({
        where: { id },
        data: { status: 'submitted' },
        select: STOCK_COUNT_DETAIL_SELECT,
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'STOCK_COUNT_SUBMITTED',
        entityType: 'stock_count',
        entityId: stockCount.id,
        oldData: { status: 'draft' },
        newData: { status: 'submitted', countNo: stockCount.countNo },
      });

      return stockCount;
    });

    return toStockCountDetail(submitted);
  }

  async cancel(
    id: string,
    dto: CancelStockCountDto,
    actor: AuthenticatedUser,
  ): Promise<StockCountDetailResponse> {
    const permissions = new Set(actor.permissions);
    const hasCreate = permissions.has('stock_count.create');
    const hasApprove = permissions.has('stock_count.approve');

    if (!hasCreate && !hasApprove) {
      throw new ForbiddenException('Bạn không có quyền hủy phiếu kiểm kê');
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<LockedStockCountRow[]>`
        SELECT id, count_no, status, counted_at, created_by, note
        FROM stock_counts
        WHERE id = ${id}::uuid
        FOR UPDATE
      `;
      const locked = lockedRows[0];
      if (!locked) {
        throw new NotFoundException('Không tìm thấy phiếu kiểm kê');
      }

      if (locked.status === 'draft') {
        if (!hasCreate || locked.created_by !== actor.id) {
          throw new ForbiddenException(
            'Chỉ người lập phiếu có quyền tạo kiểm kê mới được hủy phiếu nháp này',
          );
        }
      } else if (locked.status === 'submitted') {
        if (!hasApprove) {
          throw new ForbiddenException(
            'Chỉ người có quyền duyệt kiểm kê mới được hủy phiếu đã gửi duyệt',
          );
        }
      } else {
        throw new ConflictException(
          'Chỉ được hủy phiếu kiểm kê ở trạng thái nháp hoặc chờ duyệt',
        );
      }

      const updatedNote = appendCancelReasonToNote(locked.note, dto.reason);
      const stockCount = await tx.stockCount.update({
        where: { id },
        data: {
          status: 'cancelled',
          note: updatedNote,
        },
        select: STOCK_COUNT_DETAIL_SELECT,
      });

      await writeAuditLog(tx, {
        actorUserId: actor.id,
        eventType: 'STOCK_COUNT_CANCELLED',
        entityType: 'stock_count',
        entityId: stockCount.id,
        oldData: { status: locked.status, note: locked.note },
        newData: {
          status: 'cancelled',
          countNo: stockCount.countNo,
          reason: dto.reason,
        },
      });

      return stockCount;
    });

    return toStockCountDetail(cancelled);
  }

  /**
   * Duyệt phiếu kiểm kê và điều chỉnh tồn kho trong một DB transaction nguyên tử (skill `stock-transaction`, D-024):
   * 1. Khóa dòng phiếu kiểm kê `FOR UPDATE` & kiểm trạng thái `submitted`.
   * 2. Đọc lại & kiểm tra toàn bộ dòng kiểm kê trong cùng transaction.
   * 3. Sắp xếp dòng theo `lotId ASC` chống deadlock.
   * 4. Khóa `lots` & `inventory_lot_balances` `FOR UPDATE`; đối chiếu `on_hand_qty === system_qty` (khác → 409 liệt kê lô lệch).
   * 5. Với từng dòng có chênh lệch: đặt `on_hand_qty = counted_qty` bằng SQL nguyên tử có `RETURNING`.
   * 6. Ghi `stock_movements` (`ADJUSTMENT` / `STOCK_COUNT`) qua `protected recordStockMovement`.
   * 7. Chốt trạng thái `approved` với điều kiện kép `where: { id, status: 'submitted' }`.
   * 8. Ghi `audit_logs` (`STOCK_COUNT_APPROVED`) trong cùng transaction.
   * 9. Đọc lại và trả chi tiết phiếu từ `tx`.
   */
  async approve(id: string, actorUserId: string): Promise<StockCountDetailResponse> {
    const approvedAt = new Date();

    const approved = await this.prisma.$transaction(
      async (tx) => {
        // Bước 1: Khóa bi quan dòng phiếu kiểm kê
        const lockedRows = await tx.$queryRaw<LockedStockCountRow[]>`
          SELECT id, count_no, status, counted_at, created_by, note
          FROM stock_counts
          WHERE id = ${id}::uuid
          FOR UPDATE
        `;
        const locked = lockedRows[0];
        if (!locked) {
          throw new NotFoundException('Không tìm thấy phiếu kiểm kê');
        }
        if (locked.status !== 'submitted') {
          if (locked.status === 'approved') {
            throw new ConflictException('Phiếu kiểm kê đã được duyệt trước đó');
          }
          if (locked.status === 'draft') {
            throw new ConflictException('Phiếu kiểm kê chưa được gửi duyệt');
          }
          throw new ConflictException('Phiếu kiểm kê đã bị hủy, không thể duyệt');
        }

        // Bước 2: Đọc lại và kiểm tra toàn bộ điều kiện nghiệp vụ bên trong transaction
        const items = await tx.stockCountItem.findMany({
          where: { countId: locked.id },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            lot: {
              select: {
                id: true,
                lotCode: true,
                status: true,
                product: { select: { code: true, name: true } },
              },
            },
          },
        });

        if (items.length === 0) {
          throw new BadRequestException({
            message: 'Phiếu kiểm kê phải có ít nhất 1 dòng lô hàng',
            errors: [{ field: 'items', message: 'Phiếu kiểm kê phải có ít nhất 1 dòng lô hàng' }],
          });
        }

        const validationErrors: FieldValidationError[] = [];
        items.forEach((item, idx) => {
          if (item.countedQty.lt(0)) {
            validationErrors.push({
              field: `items.${idx}.countedQty`,
              message: 'Số lượng đếm không được âm',
            });
          }
          if (!item.varianceQty.eq(item.countedQty.minus(item.systemQty))) {
            validationErrors.push({
              field: `items.${idx}.varianceQty`,
              message: 'Số liệu chênh lệch không nhất quán',
            });
          }
          if (!item.varianceQty.eq(0) && (!item.reason || item.reason.trim().length === 0)) {
            validationErrors.push({
              field: `items.${idx}.reason`,
              message: 'Bắt buộc nhập lý do khi số đếm chênh lệch với tồn hệ thống',
            });
          }
        });

        if (validationErrors.length > 0) {
          throw new BadRequestException({
            message: validationErrors[0].message,
            errors: validationErrors,
          });
        }

        // Bước 3: Sắp xếp cố định theo lotId ASC chống deadlock
        const sortedItems = sortStockCountItemsForLocking(items);

        // Bước 4: Khóa lần lượt từng lô + số tồn và đối chiếu tồn hiện tại với system_qty
        const balanceExistsByLotId = new Map<string, boolean>();
        const driftErrors: FieldValidationError[] = [];

        for (const item of sortedItems) {
          const lotRows = await tx.$queryRaw<LockedLotRow[]>`
            SELECT id, lot_code, status
            FROM lots
            WHERE id = ${item.lotId}::uuid
            FOR UPDATE
          `;
          const lockedLot = lotRows[0];
          if (!lockedLot) {
            throw new ConflictException(`Lô hàng ${item.lot.lotCode} không còn tồn tại`);
          }
          if (lockedLot.status === 'closed') {
            throw new ConflictException(
              `Lô hàng ${lockedLot.lot_code} đã đóng, không thể điều chỉnh tồn`,
            );
          }

          const balanceRows = await tx.$queryRaw<LockedBalanceRow[]>`
            SELECT lot_id, on_hand_qty::text AS on_hand_qty, version
            FROM inventory_lot_balances
            WHERE lot_id = ${item.lotId}::uuid
            FOR UPDATE
          `;
          const lockedBalance = balanceRows[0];
          balanceExistsByLotId.set(item.lotId, Boolean(lockedBalance));

          const currentOnHand = lockedBalance
            ? new Prisma.Decimal(lockedBalance.on_hand_qty)
            : new Prisma.Decimal(0);

          if (!currentOnHand.eq(item.systemQty)) {
            driftErrors.push({
              field: `lot:${lockedLot.lot_code}`,
              message: `Lô ${lockedLot.lot_code} (${item.lot.product.code}): tồn lúc kiểm kê ${item.systemQty.toString()}, tồn hiện tại ${currentOnHand.toString()}`,
            });
          }
        }

        if (driftErrors.length > 0) {
          throw new ConflictException({
            message: 'Tồn đã thay đổi sau khi kiểm đếm, cần đối chiếu lại',
            errors: driftErrors,
          });
        }

        // Bước 5 & 6: Đổi tồn nguyên tử và ghi stock_movements cho các dòng có chênh lệch
        let adjustedLotCount = 0;
        let totalVariance = new Prisma.Decimal(0);

        for (const item of sortedItems) {
          if (item.varianceQty.eq(0)) {
            continue;
          }

          const countedQtySql = item.countedQty.toFixed(3);
          const systemQtySql = item.systemQty.toFixed(3);
          const hasBalanceRow = balanceExistsByLotId.get(item.lotId) === true;

          let balanceAfter: Prisma.Decimal;

          if (hasBalanceRow) {
            const updatedRows = await tx.$queryRaw<BalanceUpdateRow[]>`
              UPDATE inventory_lot_balances
              SET on_hand_qty = ${countedQtySql}::numeric(14,3),
                  version     = version + 1,
                  updated_at  = NOW()
              WHERE lot_id = ${item.lotId}::uuid
                AND on_hand_qty = ${systemQtySql}::numeric(14,3)
                AND ${countedQtySql}::numeric(14,3) >= 0
              RETURNING on_hand_qty::text AS balance_after, version
            `;
            if (updatedRows.length !== 1) {
              throw new ConflictException('Tồn đã thay đổi sau khi kiểm đếm, cần đối chiếu lại');
            }
            balanceAfter = new Prisma.Decimal(updatedRows[0].balance_after);
          } else {
            const insertedRows = await tx.$queryRaw<BalanceUpdateRow[]>`
              INSERT INTO inventory_lot_balances (lot_id, on_hand_qty, version, updated_at)
              VALUES (${item.lotId}::uuid, ${countedQtySql}::numeric(14,3), 1, NOW())
              ON CONFLICT (lot_id) DO NOTHING
              RETURNING on_hand_qty::text AS balance_after, version
            `;
            if (insertedRows.length !== 1) {
              throw new ConflictException('Tồn đã thay đổi sau khi kiểm đếm, cần đối chiếu lại');
            }
            balanceAfter = new Prisma.Decimal(insertedRows[0].balance_after);
          }

          await this.recordStockMovement(tx, {
            lotId: item.lotId,
            quantityDelta: item.varianceQty,
            balanceAfter,
            sourceId: locked.id,
            actorUserId,
            occurredAt: approvedAt,
          });

          adjustedLotCount += 1;
          totalVariance = totalVariance.plus(item.varianceQty);
        }

        // Bước 7: Chốt trạng thái phiếu với điều kiện kép
        const updateResult = await tx.stockCount.updateMany({
          where: { id: locked.id, status: 'submitted' },
          data: {
            status: 'approved',
            approvedBy: actorUserId,
            approvedAt,
          },
        });
        if (updateResult.count !== 1) {
          throw new ConflictException(
            'Phiếu kiểm kê đã được duyệt hoặc không ở trạng thái chờ duyệt',
          );
        }

        // Bước 8: Ghi audit log trong cùng transaction
        await writeAuditLog(tx, {
          actorUserId,
          eventType: 'STOCK_COUNT_APPROVED',
          entityType: 'stock_count',
          entityId: locked.id,
          oldData: { status: 'submitted' },
          newData: {
            status: 'approved',
            countNo: locked.count_no,
            lineCount: sortedItems.length,
            adjustedLotCount,
            totalVarianceQty: totalVariance.toString(),
          },
        });

        // Bước 9: Đọc lại chi tiết phiếu từ tx
        return tx.stockCount.findUniqueOrThrow({
          where: { id: locked.id },
          select: STOCK_COUNT_DETAIL_SELECT,
        });
      },
      { timeout: 10_000 },
    );

    return toStockCountDetail(approved);
  }

  protected async recordStockMovement(
    tx: Prisma.TransactionClient,
    input: StockCountMovementInput,
  ): Promise<void> {
    await tx.stockMovement.create({
      data: {
        lotId: input.lotId,
        movementType: 'ADJUSTMENT',
        quantityDelta: input.quantityDelta,
        balanceAfter: input.balanceAfter,
        sourceType: 'STOCK_COUNT',
        sourceId: input.sourceId,
        actorUserId: input.actorUserId,
        occurredAt: input.occurredAt,
      },
    });
  }
}
