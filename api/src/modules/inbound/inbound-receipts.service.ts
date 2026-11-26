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
import {
  buildNextReceiptNo,
  buildReceiptNoPrefix,
  checkExistingLotConflicts,
  formatUtcDate,
  groupItemsByLot,
  isValidIsoDate,
  NormalizedReceiptItem,
  summarizeReceiptItems,
  toUtcDate,
  validateReceiptItems,
} from './domain/inbound-policy';
import {
  CreateInboundReceiptDto,
  ListInboundReceiptsQueryDto,
  UpdateInboundReceiptDto,
} from './dto/inbound-receipt.dto';

export interface InboundReceiptSummaryResponse {
  id: string;
  receiptNo: string;
  receiptDate: string;
  status: string;
  notes: string | null;
  supplier: {
    id: string;
    code: string;
    name: string;
  };
  creator: {
    id: string;
    fullName: string;
  };
  confirmer: {
    id: string;
    fullName: string;
  } | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lineCount: number;
  totalQuantity: string;
  totalAmount?: string;
}

export interface InboundReceiptItemResponse {
  id: string;
  productId: string;
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  lotId: string | null;
  lotCode: string;
  expiryDate: string;
  manufacturedDate: string | null;
  quantity: string;
  unitCost?: string | null;
  lineTotal?: string | null;
}

export interface InboundReceiptDetailResponse extends InboundReceiptSummaryResponse {
  items: InboundReceiptItemResponse[];
}

export interface InboundReceiptListResponse {
  items: InboundReceiptSummaryResponse[];
  total: number;
  page: number;
  pageSize: number;
}

interface LockedReceiptRow {
  id: string;
  receipt_no: string;
  supplier_id: string;
  receipt_date: string;
  status: string;
}

interface LockedLotRow {
  id: string;
  expiry_date: string;
  manufactured_date: string | null;
  status: string;
}

interface BalanceUpsertRow {
  balance_after: string;
  version: number;
}

interface StockMovementRecordInput {
  lotId: string;
  quantityDelta: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  sourceId: string;
  actorUserId: string;
  occurredAt: Date;
}

const MAX_RECEIPT_NO_RETRIES = 5;

const RECEIPT_DETAIL_SELECT = {
  id: true,
  receiptNo: true,
  receiptDate: true,
  status: true,
  notes: true,
  confirmedAt: true,
  createdAt: true,
  updatedAt: true,
  supplier: {
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
      productId: true,
      lotId: true,
      lotCode: true,
      expiryDate: true,
      manufacturedDate: true,
      quantity: true,
      unitCost: true,
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
} satisfies Prisma.InboundReceiptSelect;

type ReceiptDetailRecord = Prisma.InboundReceiptGetPayload<{
  select: typeof RECEIPT_DETAIL_SELECT;
}>;

function toReceiptSummary(
  record: ReceiptDetailRecord,
  includeMoney = false,
): InboundReceiptSummaryResponse {
  const summary = summarizeReceiptItems(record.items);
  const result: InboundReceiptSummaryResponse = {
    id: record.id,
    receiptNo: record.receiptNo,
    receiptDate: formatUtcDate(record.receiptDate),
    status: record.status,
    notes: record.notes,
    supplier: record.supplier,
    creator: record.creator,
    confirmer: record.confirmer,
    confirmedAt: record.confirmedAt ? record.confirmedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lineCount: summary.lineCount,
    totalQuantity: summary.totalQuantity,
  };
  if (includeMoney) {
    result.totalAmount = summary.totalAmount;
  }
  return result;
}

function toReceiptDetail(
  record: ReceiptDetailRecord,
  includeMoney = false,
): InboundReceiptDetailResponse {
  const summary = summarizeReceiptItems(record.items);
  return {
    ...toReceiptSummary(record, includeMoney),
    items: record.items.map((item, idx) => {
      const mapped: InboundReceiptItemResponse = {
        id: item.id,
        productId: item.productId,
        product: item.product,
        lotId: item.lotId,
        lotCode: item.lotCode,
        expiryDate: formatUtcDate(item.expiryDate),
        manufacturedDate: item.manufacturedDate ? formatUtcDate(item.manufacturedDate) : null,
        quantity: item.quantity.toString(),
      };
      if (includeMoney) {
        mapped.unitCost = item.unitCost !== null ? item.unitCost.toString() : null;
        mapped.lineTotal = summary.lineTotals[idx] ?? null;
      }
      return mapped;
    }),
  };
}

function isReceiptNoUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes('receipt_no');
  }
  if (typeof target === 'string') {
    return target.includes('receipt_no');
  }
  return false;
}

@Injectable()
export class InboundReceiptsService {
  private readonly logger = new Logger(InboundReceiptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly analysisTrigger?: AnalysisTriggerService,
  ) {}

  async findAll(
    query: ListInboundReceiptsQueryDto,
    options?: { includeMoney?: boolean },
  ): Promise<InboundReceiptListResponse> {
    const includeMoney = options?.includeMoney ?? false;
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

    const where: Prisma.InboundReceiptWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.supplierId) {
      where.supplierId = query.supplierId;
    }
    if (query.from || query.to) {
      where.receiptDate = {
        ...(query.from ? { gte: toUtcDate(query.from) } : {}),
        ...(query.to ? { lte: toUtcDate(query.to) } : {}),
      };
    }
    if (query.search) {
      where.OR = [
        { receiptNo: { contains: query.search, mode: 'insensitive' } },
        { supplier: { name: { contains: query.search, mode: 'insensitive' } } },
        { supplier: { code: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [total, records] = await Promise.all([
      this.prisma.inboundReceipt.count({ where }),
      this.prisma.inboundReceipt.findMany({
        where,
        select: RECEIPT_DETAIL_SELECT,
        orderBy: [{ receiptDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: records.map((record) => toReceiptSummary(record, includeMoney)),
      total,
      page,
      pageSize,
    };
  }

  async findOne(
    id: string,
    options?: { includeMoney?: boolean },
  ): Promise<InboundReceiptDetailResponse> {
    const record = await this.prisma.inboundReceipt.findUnique({
      where: { id },
      select: RECEIPT_DETAIL_SELECT,
    });
    if (!record) {
      throw new NotFoundException('Không tìm thấy phiếu nhập');
    }
    return toReceiptDetail(record, options?.includeMoney ?? false);
  }

  async create(
    dto: CreateInboundReceiptDto,
    actorUserId: string,
    options?: { includeMoney?: boolean; allowUnitCost?: boolean },
  ): Promise<InboundReceiptDetailResponse> {
    const allowUnitCost = options?.allowUnitCost ?? true;
    const effectiveDto: CreateInboundReceiptDto = allowUnitCost
      ? dto
      : {
          ...dto,
          items: dto.items.map((item) => ({ ...item, unitCost: null })),
        };
    const normalizedItems = await this.validateDraftPayload(effectiveDto);
    const receiptDateUtc = toUtcDate(effectiveDto.receiptDate);
    const prefix = buildReceiptNoPrefix(effectiveDto.receiptDate);

    for (let attempt = 0; attempt < MAX_RECEIPT_NO_RETRIES; attempt += 1) {
      const latestRows = await this.prisma.$queryRaw<Array<{ receipt_no: string }>>`
        SELECT receipt_no
        FROM inbound_receipts
        WHERE receipt_no LIKE ${`${prefix}%`}
        ORDER BY char_length(receipt_no) DESC, receipt_no DESC
        LIMIT 1
      `;
      const receiptNo = buildNextReceiptNo(dto.receiptDate, latestRows[0]?.receipt_no ?? null);

      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const baseItemTime = Date.now();
          const receipt = await tx.inboundReceipt.create({
            data: {
              receiptNo,
              supplierId: dto.supplierId,
              receiptDate: receiptDateUtc,
              status: 'draft',
              createdBy: actorUserId,
              notes: dto.notes ?? null,
              items: {
                create: normalizedItems.map((item, idx) => ({
                  productId: item.productId,
                  lotId: null,
                  lotCode: item.lotCode,
                  expiryDate: toUtcDate(item.expiryDate),
                  manufacturedDate: item.manufacturedDate ? toUtcDate(item.manufacturedDate) : null,
                  quantity: item.quantity,
                  unitCost: item.unitCost,
                  createdAt: new Date(baseItemTime + idx),
                })),
              },
            },
            select: RECEIPT_DETAIL_SELECT,
          });

          const summary = summarizeReceiptItems(receipt.items);
          await writeAuditLog(tx, {
            actorUserId,
            eventType: 'INBOUND_CREATED',
            entityType: 'inbound_receipt',
            entityId: receipt.id,
            newData: {
              receiptNo: receipt.receiptNo,
              supplierId: dto.supplierId,
              receiptDate: dto.receiptDate,
              lineCount: summary.lineCount,
              totalQuantity: summary.totalQuantity,
            },
          });

          return receipt;
        });

        return toReceiptDetail(created, options?.includeMoney ?? false);
      } catch (error) {
        if (isReceiptNoUniqueViolation(error) && attempt < MAX_RECEIPT_NO_RETRIES - 1) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException('Không thể sinh số phiếu nhập duy nhất, vui lòng thử lại');
  }

  async update(
    id: string,
    dto: UpdateInboundReceiptDto,
    actorUserId: string,
    options?: { includeMoney?: boolean; allowUnitCost?: boolean },
  ): Promise<InboundReceiptDetailResponse> {
    const allowUnitCost = options?.allowUnitCost ?? true;
    const effectiveDto: UpdateInboundReceiptDto = allowUnitCost
      ? dto
      : {
          ...dto,
          items: dto.items.map((item) => ({ ...item, unitCost: null })),
        };
    const normalizedItems = await this.validateDraftPayload(effectiveDto);
    const receiptDateUtc = toUtcDate(effectiveDto.receiptDate);

    const updated = await this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<LockedReceiptRow[]>`
        SELECT id, receipt_no, supplier_id, receipt_date::text AS receipt_date, status
        FROM inbound_receipts
        WHERE id = ${id}::uuid
        FOR UPDATE
      `;
      const locked = lockedRows[0];
      if (!locked) {
        throw new NotFoundException('Không tìm thấy phiếu nhập');
      }
      if (locked.status !== 'draft') {
        throw new ConflictException('Chỉ được sửa phiếu nhập ở trạng thái nháp');
      }

      // Khi người sửa thiếu quyền reports.read: bỏ qua unitCost gửi lên, giữ lại unitCost cũ
      // của các dòng trùng (productId, lotCode) và để null cho dòng mới (T-024).
      const existingCostQueues = new Map<string, Array<Prisma.Decimal | null>>();
      const existingCostFallback = new Map<string, Prisma.Decimal | null>();
      if (!allowUnitCost) {
        const existingItems = await tx.inboundReceiptItem.findMany({
          where: { receiptId: id },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { productId: true, lotCode: true, unitCost: true },
        });
        for (const existing of existingItems) {
          const key = `${existing.productId}::${existing.lotCode}`;
          const queue = existingCostQueues.get(key) ?? [];
          queue.push(existing.unitCost);
          existingCostQueues.set(key, queue);
          if (!existingCostFallback.has(key) || existingCostFallback.get(key) === null) {
            existingCostFallback.set(key, existing.unitCost);
          }
        }
      }

      await tx.inboundReceiptItem.deleteMany({ where: { receiptId: id } });

      const baseItemTime = Date.now();
      const receipt = await tx.inboundReceipt.update({
        where: { id },
        data: {
          supplierId: effectiveDto.supplierId,
          receiptDate: receiptDateUtc,
          notes: effectiveDto.notes ?? null,
          items: {
            create: normalizedItems.map((item, idx) => {
              let resolvedUnitCost: Prisma.Decimal | null = item.unitCost;
              if (!allowUnitCost) {
                const key = `${item.productId}::${item.lotCode}`;
                const queue = existingCostQueues.get(key);
                if (queue && queue.length > 0) {
                  resolvedUnitCost = queue.shift() ?? null;
                } else {
                  resolvedUnitCost = existingCostFallback.get(key) ?? null;
                }
              }
              return {
                productId: item.productId,
                lotId: null,
                lotCode: item.lotCode,
                expiryDate: toUtcDate(item.expiryDate),
                manufacturedDate: item.manufacturedDate ? toUtcDate(item.manufacturedDate) : null,
                quantity: item.quantity,
                unitCost: resolvedUnitCost,
                createdAt: new Date(baseItemTime + idx),
              };
            }),
          },
        },
        select: RECEIPT_DETAIL_SELECT,
      });

      const summary = summarizeReceiptItems(receipt.items);
      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'INBOUND_UPDATED',
        entityType: 'inbound_receipt',
        entityId: receipt.id,
        oldData: {
          supplierId: locked.supplier_id,
          receiptDate: locked.receipt_date,
        },
        newData: {
          supplierId: dto.supplierId,
          receiptDate: dto.receiptDate,
          lineCount: summary.lineCount,
          totalQuantity: summary.totalQuantity,
        },
      });

      return receipt;
    });

    return toReceiptDetail(updated, options?.includeMoney ?? false);
  }

  async cancel(
    id: string,
    actorUserId: string,
    options?: { includeMoney?: boolean },
  ): Promise<InboundReceiptDetailResponse> {
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<LockedReceiptRow[]>`
        SELECT id, receipt_no, supplier_id, receipt_date::text AS receipt_date, status
        FROM inbound_receipts
        WHERE id = ${id}::uuid
        FOR UPDATE
      `;
      const locked = lockedRows[0];
      if (!locked) {
        throw new NotFoundException('Không tìm thấy phiếu nhập');
      }
      if (locked.status !== 'draft') {
        throw new ConflictException('Chỉ được hủy phiếu nhập ở trạng thái nháp');
      }

      const receipt = await tx.inboundReceipt.update({
        where: { id },
        data: { status: 'cancelled' },
        select: RECEIPT_DETAIL_SELECT,
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: 'INBOUND_CANCELLED',
        entityType: 'inbound_receipt',
        entityId: receipt.id,
        oldData: { status: 'draft' },
        newData: { status: 'cancelled', receiptNo: receipt.receiptNo },
      });

      return receipt;
    });

    return toReceiptDetail(cancelled, options?.includeMoney ?? false);
  }

  /**
   * Xác nhận phiếu nhập kho trong một DB transaction nguyên tử (mẫu chuẩn stock-transaction):
   * 1. Khóa dòng phiếu (SELECT ... FOR UPDATE) & kiểm trạng thái draft.
   * 2. Kiểm tra lại NCC/sản phẩm active và tính hợp lệ toàn bộ dòng hàng.
   * 3. Gom dòng theo (productId, lotCode) và sắp xếp chuẩn để tránh deadlock.
   * 4. Tạo/khóa lô nguyên tử (ON CONFLICT DO NOTHING + FOR UPDATE), kiểm khớp HSD/NSX, gán lot_id.
   * 5. Cộng tồn nguyên tử (INSERT ... ON CONFLICT DO UPDATE ... RETURNING) & ghi sổ biến động.
   * 6. Chốt trạng thái confirmed (kèm điều kiện where status='draft') + ghi audit log.
   */
  async confirm(
    id: string,
    actorUserId: string,
    internalOptions?: { confirmedAt?: Date; includeMoney?: boolean },
  ): Promise<InboundReceiptDetailResponse> {
    const confirmedAt = internalOptions?.confirmedAt ?? new Date();

    const confirmed = await this.prisma.$transaction(
      async (tx) => {
        // Bước 1: Khóa bi quan dòng phiếu nhập
        const lockedRows = await tx.$queryRaw<LockedReceiptRow[]>`
          SELECT id, receipt_no, supplier_id, receipt_date::text AS receipt_date, status
          FROM inbound_receipts
          WHERE id = ${id}::uuid
          FOR UPDATE
        `;
        const locked = lockedRows[0];
        if (!locked) {
          throw new NotFoundException('Không tìm thấy phiếu nhập');
        }
        if (locked.status !== 'draft') {
          throw new ConflictException('Phiếu đã được xác nhận hoặc không ở trạng thái nháp');
        }

        // Bước 2: Đọc lại dữ liệu phiếu, NCC, sản phẩm và kiểm hợp lệ trong cùng transaction
        const receiptWithItems = await tx.inboundReceipt.findUniqueOrThrow({
          where: { id },
          include: {
            supplier: { select: { id: true, status: true } },
            items: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              include: { product: { select: { id: true, status: true } } },
            },
          },
        });

        const validationErrors: FieldValidationError[] = [];
        if (receiptWithItems.supplier.status !== 'active') {
          validationErrors.push({
            field: 'supplierId',
            message: 'Nhà cung cấp đã ngừng hoạt động',
          });
        }

        receiptWithItems.items.forEach((item, idx) => {
          if (item.product.status !== 'active') {
            validationErrors.push({
              field: `items.${idx}.productId`,
              message: 'Sản phẩm đã ngừng kinh doanh',
            });
          }
        });

        const receiptDateIso = locked.receipt_date;
        const { validItems, errors: itemErrors } = validateReceiptItems(
          receiptDateIso,
          receiptWithItems.items.map((item) => ({
            itemId: item.id,
            productId: item.productId,
            lotCode: item.lotCode,
            expiryDate: formatUtcDate(item.expiryDate),
            manufacturedDate: item.manufacturedDate ? formatUtcDate(item.manufacturedDate) : null,
            quantity: item.quantity.toString(),
            unitCost: item.unitCost !== null ? item.unitCost.toString() : null,
          })),
        );
        validationErrors.push(...itemErrors);

        if (validationErrors.length > 0) {
          throw new BadRequestException({
            message: validationErrors[0].message,
            errors: validationErrors,
          });
        }

        // Bước 3: Gom dòng theo (productId, lotCode), sắp xếp cố định chống deadlock
        const lotGroups = groupItemsByLot(validItems);
        let totalConfirmedQty = new Prisma.Decimal(0);

        // Bước 4 & 5: Tạo/khóa lô, gán lot_id, cộng tồn nguyên tử và ghi sổ biến động
        for (const group of lotGroups) {
          const totalQtySql = group.totalQuantity.toFixed(3);

          await tx.$executeRaw`
            INSERT INTO lots (
              id, product_id, supplier_id, lot_code, manufactured_date,
              expiry_date, received_at, initial_quantity, status, created_at, updated_at
            )
            VALUES (
              gen_random_uuid(),
              ${group.productId}::uuid,
              ${locked.supplier_id}::uuid,
              ${group.lotCode},
              ${group.manufacturedDate}::date,
              ${group.expiryDate}::date,
              ${receiptDateIso}::date,
              ${totalQtySql}::numeric(14,3),
              'active',
              NOW(),
              NOW()
            )
            ON CONFLICT (product_id, lot_code) DO NOTHING
          `;

          const lotRows = await tx.$queryRaw<LockedLotRow[]>`
            SELECT id, expiry_date::text AS expiry_date, manufactured_date::text AS manufactured_date, status
            FROM lots
            WHERE product_id = ${group.productId}::uuid AND lot_code = ${group.lotCode}
            FOR UPDATE
          `;
          const lot = lotRows[0];
          if (!lot) {
            throw new ConflictException(`Không thể khởi tạo lô ${group.lotCode}`);
          }

          if (lot.expiry_date !== group.expiryDate) {
            throw new BadRequestException({
              message: 'Mã lô đã tồn tại với hạn sử dụng khác',
              errors: group.rowIndices.map((rowIndex) => ({
                field: `items.${rowIndex}.lotCode`,
                message: 'Mã lô đã tồn tại với hạn sử dụng khác',
              })),
            });
          }

          if (
            group.manufacturedDate !== null &&
            lot.manufactured_date !== null &&
            lot.manufactured_date !== group.manufacturedDate
          ) {
            throw new BadRequestException({
              message: 'Mã lô đã tồn tại với ngày sản xuất khác',
              errors: group.rowIndices.map((rowIndex) => ({
                field: `items.${rowIndex}.manufacturedDate`,
                message: 'Mã lô đã tồn tại với ngày sản xuất khác',
              })),
            });
          }

          await tx.inboundReceiptItem.updateMany({
            where: { id: { in: group.itemIds } },
            data: { lotId: lot.id },
          });

          const balanceRows = await tx.$queryRaw<BalanceUpsertRow[]>`
            INSERT INTO inventory_lot_balances (lot_id, on_hand_qty, version, updated_at)
            VALUES (${lot.id}::uuid, ${totalQtySql}::numeric(14,3), 1, NOW())
            ON CONFLICT (lot_id) DO UPDATE
            SET on_hand_qty = inventory_lot_balances.on_hand_qty + EXCLUDED.on_hand_qty,
                version     = inventory_lot_balances.version + 1,
                updated_at  = NOW()
            RETURNING on_hand_qty::text AS balance_after, version
          `;
          const balanceAfter = new Prisma.Decimal(balanceRows[0].balance_after);

          await this.recordStockMovement(tx, {
            lotId: lot.id,
            quantityDelta: group.totalQuantity,
            balanceAfter,
            sourceId: locked.id,
            actorUserId,
            occurredAt: confirmedAt,
          });

          totalConfirmedQty = totalConfirmedQty.add(group.totalQuantity);
        }

        // Bước 6: Cập nhật phiếu (bảo vệ kép điều kiện status='draft') và ghi audit_logs
        const updateResult = await tx.inboundReceipt.updateMany({
          where: { id: locked.id, status: 'draft' },
          data: {
            status: 'confirmed',
            confirmedBy: actorUserId,
            confirmedAt,
          },
        });
        if (updateResult.count !== 1) {
          throw new ConflictException('Phiếu đã được xác nhận hoặc không ở trạng thái nháp');
        }

        await writeAuditLog(tx, {
          actorUserId,
          eventType: 'INBOUND_CONFIRMED',
          entityType: 'inbound_receipt',
          entityId: locked.id,
          oldData: { status: 'draft' },
          newData: {
            status: 'confirmed',
            receiptNo: locked.receipt_no,
            lotCount: lotGroups.length,
            totalQuantity: totalConfirmedQty.toString(),
          },
        });

        return tx.inboundReceipt.findUniqueOrThrow({
          where: { id: locked.id },
          select: RECEIPT_DETAIL_SELECT,
        });
      },
      { timeout: 10_000 },
    );

    // Hook sau commit (ngoài transaction): kích hoạt phân tích nền, không chặn response và không làm hỏng xác nhận
    try {
      this.analysisTrigger?.notifyStockChanged({
        sourceType: 'INBOUND_RECEIPT',
        sourceId: confirmed.id,
        receiptNo: confirmed.receiptNo,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Lỗi gọi hook STOCK_CHANGE sau xác nhận phiếu nhập ${confirmed.receiptNo}: ${detail}`);
    }

    return toReceiptDetail(confirmed, internalOptions?.includeMoney ?? false);
  }

  protected async recordStockMovement(
    tx: Prisma.TransactionClient,
    input: StockMovementRecordInput,
  ): Promise<void> {
    await tx.stockMovement.create({
      data: {
        lotId: input.lotId,
        movementType: 'INBOUND',
        quantityDelta: input.quantityDelta,
        balanceAfter: input.balanceAfter,
        sourceType: 'INBOUND_RECEIPT',
        sourceId: input.sourceId,
        actorUserId: input.actorUserId,
        occurredAt: input.occurredAt,
      },
    });
  }

  private async validateDraftPayload(
    dto: CreateInboundReceiptDto,
  ): Promise<NormalizedReceiptItem[]> {
    const errors: FieldValidationError[] = [];

    const { validItems, errors: domainErrors } = validateReceiptItems(dto.receiptDate, dto.items);
    errors.push(...domainErrors);

    const uniqueProductIds = Array.from(new Set(dto.items.map((item) => item.productId)));

    const [supplier, products] = await Promise.all([
      this.prisma.supplier.findUnique({
        where: { id: dto.supplierId },
        select: { id: true, status: true },
      }),
      uniqueProductIds.length > 0
        ? this.prisma.product.findMany({
            where: { id: { in: uniqueProductIds } },
            select: { id: true, status: true },
          })
        : Promise.resolve([]),
    ]);

    if (!supplier || supplier.status !== 'active') {
      errors.push({
        field: 'supplierId',
        message: 'Nhà cung cấp không tồn tại hoặc đã ngừng hoạt động',
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

    if (validItems.length > 0) {
      const lotCriteria = Array.from(
        new Map(
          validItems.map((item) => [
            `${item.productId}::${item.lotCode}`,
            { productId: item.productId, lotCode: item.lotCode },
          ]),
        ).values(),
      );

      const existingLots = await this.prisma.lot.findMany({
        where: { OR: lotCriteria },
        select: {
          id: true,
          productId: true,
          lotCode: true,
          expiryDate: true,
          manufacturedDate: true,
        },
      });

      const conflictErrors = checkExistingLotConflicts(
        validItems,
        existingLots.map((lot) => ({
          id: lot.id,
          productId: lot.productId,
          lotCode: lot.lotCode,
          expiryDate: formatUtcDate(lot.expiryDate),
          manufacturedDate: lot.manufacturedDate ? formatUtcDate(lot.manufacturedDate) : null,
        })),
      );
      errors.push(...conflictErrors);
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        message: errors[0].message,
        errors,
      });
    }

    return validItems;
  }
}
