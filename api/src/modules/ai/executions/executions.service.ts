import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { writeAuditLog } from '../../../common/utils/audit-log.util';
import { PrismaService } from '../../../prisma/prisma.service';
import { formatDateOnly, getVnTodayDateString } from '../../expiry/domain/vn-date';
import { formatUtcDate, parseDecimalString } from '../../inbound/domain/inbound-policy';
import {
  buildNextOutboundNo,
  buildOutboundNoPrefix,
  isPgConcurrencyConflictError,
} from '../../outbound/domain/outbound-policy';
import {
  OutboundReceiptDetailResponse,
  OutboundReceiptsService,
} from '../../outbound/outbound-receipts.service';
import { AnalysisTriggerService } from '../pipeline/analysis-trigger.service';
import { ACTION_LABELS, ProposalActionType } from '../proposals/domain/rules';
import { QUANTITY_DECIMAL_PLACES } from '../risk/domain/lot-risk.domain';
import {
  canLinkOrderOutbound,
  ExecutionStatus,
  isTerminalExecutionStatus,
  resolveDisposalConfig,
  resolveSyncedProposalStatus,
  validateExecutionUpdate,
} from './domain/execution-policy';
import { CreateExecutionDisposalDto } from './dto/create-execution-disposal.dto';
import { LinkExecutionOutboundDto } from './dto/link-execution-outbound.dto';
import { ListExecutionsQueryDto } from './dto/list-executions-query.dto';
import { RecordExecutionUpdateDto } from './dto/record-execution-update.dto';

export interface LinkedOutboundRef {
  id: string;
  outboundNo: string;
  outboundType: string;
  confirmedAt: string | null;
}

export interface ExecutionUpdateItemResponse {
  id: string;
  status: ExecutionStatus;
  actualQtyDelta: string | null;
  note: string | null;
  occurredOn: string | null;
  updatedAt: string;
  updater: {
    id: string;
    fullName: string;
  };
  linkedOutbound: LinkedOutboundRef | null;
}

export interface ExecutionDetailResponse {
  id: string;
  proposalId: string;
  status: ExecutionStatus;
  plannedQty: string;
  actualQty: string | null;
  remainingQty: string;
  note: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  proposal: {
    id: string;
    actionType: ProposalActionType;
    actionLabel: string;
    status: string;
    proposedQty: string;
  };
  lot: {
    id: string;
    lotCode: string;
    expiryDate: string;
    status: string;
    currentOnHandQty: string;
  };
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  decision: {
    decidedAt: string;
    reason: string | null;
    decider: {
      id: string;
      fullName: string;
    };
  } | null;
  responsibleUser: {
    id: string;
    fullName: string;
  };
  linkedOutbound: LinkedOutboundRef | null;
  linkedOutbounds: LinkedOutboundRef[];
  updates: ExecutionUpdateItemResponse[];
}

export interface ExecutionsKpiResponse {
  approvedCount: number;
  inProgressCount: number;
  plannedQtyTotal: string;
  actualQtyTotal: string;
}

export interface ExecutionsListResponse {
  kpi: ExecutionsKpiResponse;
  items: ExecutionDetailResponse[];
}

export interface CreateExecutionDisposalResponse {
  execution: ExecutionDetailResponse;
  outboundReceipt: OutboundReceiptDetailResponse;
}

interface LockedExecutionRow {
  id: string;
  proposal_id: string;
  status: string;
  planned_qty: string;
  actual_qty: string | null;
  linked_outbound_id: string | null;
  started_at: Date | null;
}

interface LockedLotRow {
  id: string;
  product_id: string;
  lot_code: string;
  expiry_date: string;
  status: string;
}

interface LockedBalanceRow {
  lot_id: string;
  on_hand_qty: string;
  version: number;
}

const ZERO = new Prisma.Decimal(0);
const MAX_OUTBOUND_NO_RETRIES = 5;

const EXECUTION_SELECT = {
  id: true,
  proposalId: true,
  status: true,
  plannedQty: true,
  actualQty: true,
  note: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  responsibleUser: {
    select: {
      id: true,
      fullName: true,
    },
  },
  linkedOutbound: {
    select: {
      id: true,
      outboundNo: true,
      outboundType: true,
      confirmedAt: true,
    },
  },
  proposal: {
    select: {
      id: true,
      actionType: true,
      status: true,
      proposedQty: true,
      lot: {
        select: {
          id: true,
          lotCode: true,
          expiryDate: true,
          status: true,
          balance: {
            select: {
              onHandQty: true,
            },
          },
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
      decision: {
        select: {
          decidedAt: true,
          reason: true,
          decider: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      },
    },
  },
  updates: {
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      status: true,
      actualQty: true,
      note: true,
      occurredOn: true,
      updatedAt: true,
      updater: {
        select: {
          id: true,
          fullName: true,
        },
      },
      linkedOutbound: {
        select: {
          id: true,
          outboundNo: true,
          outboundType: true,
          confirmedAt: true,
        },
      },
    },
  },
} satisfies Prisma.TreatmentExecutionSelect;

const OUTBOUND_RECEIPT_DETAIL_SELECT = {
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

type ExecutionRecord = Prisma.TreatmentExecutionGetPayload<{
  select: typeof EXECUTION_SELECT;
}>;

type OutboundDetailRecord = Prisma.OutboundReceiptGetPayload<{
  select: typeof OUTBOUND_RECEIPT_DETAIL_SELECT;
}>;

function formatQty(value: Prisma.Decimal | string | number): string {
  return new Prisma.Decimal(value).toFixed(QUANTITY_DECIMAL_PLACES);
}

function toLinkedOutboundRef(
  row: {
    id: string;
    outboundNo: string;
    outboundType: string;
    confirmedAt: Date | null;
  } | null,
): LinkedOutboundRef | null {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    outboundNo: row.outboundNo,
    outboundType: row.outboundType,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
  };
}

function toExecutionDetail(record: ExecutionRecord): ExecutionDetailResponse {
  const actionType = record.proposal.actionType as ProposalActionType;
  const currentActual = record.actualQty ?? ZERO;
  const remaining = record.plannedQty.sub(currentActual);
  const clampedRemaining = remaining.gt(ZERO) ? remaining : ZERO;

  const linkedMap = new Map<string, LinkedOutboundRef>();
  for (const u of record.updates) {
    const ref = toLinkedOutboundRef(u.linkedOutbound);
    if (ref && !linkedMap.has(ref.id)) {
      linkedMap.set(ref.id, ref);
    }
  }
  const primaryLinked = toLinkedOutboundRef(record.linkedOutbound);
  if (primaryLinked && !linkedMap.has(primaryLinked.id)) {
    linkedMap.set(primaryLinked.id, primaryLinked);
  }

  return {
    id: record.id,
    proposalId: record.proposalId,
    status: record.status as ExecutionStatus,
    plannedQty: formatQty(record.plannedQty),
    actualQty: record.actualQty !== null ? formatQty(record.actualQty) : null,
    remainingQty: formatQty(clampedRemaining),
    note: record.note,
    startedAt: record.startedAt ? record.startedAt.toISOString() : null,
    completedAt: record.completedAt ? record.completedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    proposal: {
      id: record.proposal.id,
      actionType,
      actionLabel: ACTION_LABELS[actionType] ?? actionType,
      status: record.proposal.status,
      proposedQty: formatQty(record.proposal.proposedQty),
    },
    lot: {
      id: record.proposal.lot.id,
      lotCode: record.proposal.lot.lotCode,
      expiryDate: formatDateOnly(record.proposal.lot.expiryDate),
      status: record.proposal.lot.status,
      currentOnHandQty: formatQty(record.proposal.lot.balance?.onHandQty ?? ZERO),
    },
    product: record.proposal.lot.product,
    decision: record.proposal.decision
      ? {
          decidedAt: record.proposal.decision.decidedAt.toISOString(),
          reason: record.proposal.decision.reason,
          decider: record.proposal.decision.decider,
        }
      : null,
    responsibleUser: record.responsibleUser,
    linkedOutbound: primaryLinked,
    linkedOutbounds: Array.from(linkedMap.values()),
    updates: record.updates.map((u) => ({
      id: u.id,
      status: u.status as ExecutionStatus,
      actualQtyDelta: u.actualQty !== null ? formatQty(u.actualQty) : null,
      note: u.note,
      occurredOn: u.occurredOn ? formatDateOnly(u.occurredOn) : null,
      updatedAt: u.updatedAt.toISOString(),
      updater: u.updater,
      linkedOutbound: toLinkedOutboundRef(u.linkedOutbound),
    })),
  };
}

function toOutboundDetailResponse(record: OutboundDetailRecord): OutboundReceiptDetailResponse {
  let totalQty = new Prisma.Decimal(0);
  const uniqueLots = new Set<string>();
  for (const item of record.items) {
    totalQty = totalQty.add(item.quantity);
    uniqueLots.add(item.lotId);
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
    createdAt: record.createdAt.toISOString(),
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

function isExecutionOutboundDuplicateError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return true;
  }
  return false;
}

const STATUS_SORT_ORDER: Record<string, number> = {
  planned: 0,
  in_progress: 1,
  completed: 2,
  failed: 3,
  cancelled: 4,
};

@Injectable()
export class ExecutionsService {
  private readonly logger = new Logger(ExecutionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboundReceiptsService: OutboundReceiptsService,
    @Optional() private readonly analysisTrigger?: AnalysisTriggerService,
  ) {}

  async list(query: ListExecutionsQueryDto): Promise<ExecutionsListResponse> {
    const where: Prisma.TreatmentExecutionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.actionType ? { proposal: { actionType: query.actionType } } : {}),
    };

    const [rows, allForKpi] = await Promise.all([
      this.prisma.treatmentExecution.findMany({
        where,
        select: EXECUTION_SELECT,
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prisma.treatmentExecution.findMany({
        select: {
          status: true,
          plannedQty: true,
          actualQty: true,
        },
      }),
    ]);

    let inProgressCount = 0;
    let plannedQtyTotal = new Prisma.Decimal(0);
    let actualQtyTotal = new Prisma.Decimal(0);
    for (const item of allForKpi) {
      if (item.status === 'in_progress') {
        inProgressCount += 1;
      }
      plannedQtyTotal = plannedQtyTotal.add(item.plannedQty);
      if (item.actualQty !== null) {
        actualQtyTotal = actualQtyTotal.add(item.actualQty);
      }
    }

    const items = rows
      .map(toExecutionDetail)
      .sort((a, b) => {
        const orderA = STATUS_SORT_ORDER[a.status] ?? 99;
        const orderB = STATUS_SORT_ORDER[b.status] ?? 99;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    return {
      kpi: {
        approvedCount: allForKpi.length,
        inProgressCount,
        plannedQtyTotal: formatQty(plannedQtyTotal),
        actualQtyTotal: formatQty(actualQtyTotal),
      },
      items,
    };
  }

  async getDetail(id: string): Promise<ExecutionDetailResponse> {
    const record = await this.prisma.treatmentExecution.findUnique({
      where: { id },
      select: EXECUTION_SELECT,
    });
    if (!record) {
      throw new NotFoundException('Không tìm thấy phương án thực hiện');
    }
    return toExecutionDetail(record);
  }

  /**
   * Ghi kết quả thực hiện thủ công (KHÔNG đổi tồn kho — bất biến 1).
   */
  async recordUpdate(
    id: string,
    dto: RecordExecutionUpdateDto,
    actorUserId: string,
  ): Promise<ExecutionDetailResponse> {
    const now = new Date();

    try {
      const updated = await this.prisma.$transaction(
        async (tx) => {
          const lockedRows = await tx.$queryRaw<LockedExecutionRow[]>`
            SELECT id, proposal_id, status, planned_qty::text AS planned_qty,
                   actual_qty::text AS actual_qty, linked_outbound_id, started_at
            FROM treatment_executions
            WHERE id = ${id}::uuid
            FOR UPDATE
          `;
          const locked = lockedRows[0];
          if (!locked) {
            throw new NotFoundException('Không tìm thấy phương án thực hiện');
          }

          const check = validateExecutionUpdate({
            currentStatus: locked.status as ExecutionStatus,
            nextStatus: dto.status,
            plannedQty: new Prisma.Decimal(locked.planned_qty),
            currentActualQty:
              locked.actual_qty !== null ? new Prisma.Decimal(locked.actual_qty) : null,
            actualQtyDeltaRaw: dto.actualQtyDelta,
            note: dto.note,
            occurredOn: dto.occurredOn,
          });

          if (!check.valid) {
            if (check.conflict) {
              throw new ConflictException(check.message);
            }
            throw new BadRequestException({
              message: check.message,
              errors: check.field ? [{ field: check.field, message: check.message }] : undefined,
            });
          }

          const shouldSetStarted =
            locked.started_at === null &&
            (dto.status === 'in_progress' || dto.status === 'completed');
          const shouldSetCompleted = isTerminalExecutionStatus(dto.status);

          const updateCount = await tx.treatmentExecution.updateMany({
            where: { id: locked.id, status: locked.status },
            data: {
              status: dto.status,
              actualQty: check.nextActualQty,
              ...(check.normalizedNote !== null ? { note: check.normalizedNote } : {}),
              ...(shouldSetStarted ? { startedAt: now } : {}),
              ...(shouldSetCompleted ? { completedAt: now } : {}),
            },
          });
          if (updateCount.count !== 1) {
            throw new ConflictException('Trạng thái thực hiện đã thay đổi, vui lòng tải lại');
          }

          await tx.treatmentExecutionUpdate.create({
            data: {
              executionId: locked.id,
              status: dto.status,
              actualQty: check.delta,
              note: check.normalizedNote,
              occurredOn: check.normalizedOccurredOn
                ? new Date(`${check.normalizedOccurredOn}T00:00:00.000Z`)
                : null,
              linkedOutboundId: null,
              updatedBy: actorUserId,
              updatedAt: now,
            },
          });

          const proposal = await tx.treatmentProposal.findUniqueOrThrow({
            where: { id: locked.proposal_id },
            select: { id: true, status: true },
          });
          const nextProposalStatus = resolveSyncedProposalStatus(proposal.status, dto.status);
          if (nextProposalStatus) {
            await tx.treatmentProposal.update({
              where: { id: proposal.id },
              data: { status: nextProposalStatus },
            });
          }

          await writeAuditLog(tx, {
            actorUserId,
            eventType: 'EXECUTION_UPDATED',
            entityType: 'treatment_execution',
            entityId: locked.id,
            oldData: {
              status: locked.status,
              actualQty: locked.actual_qty,
            },
            newData: {
              status: dto.status,
              actualQtyDelta: check.delta ? check.delta.toString() : null,
              actualQtyAfter: check.nextActualQty ? check.nextActualQty.toString() : null,
              note: check.normalizedNote,
              occurredOn: check.normalizedOccurredOn,
            },
          });

          return tx.treatmentExecution.findUniqueOrThrow({
            where: { id: locked.id },
            select: EXECUTION_SELECT,
          });
        },
        { timeout: 10_000 },
      );

      return toExecutionDetail(updated);
    } catch (error) {
      if (isPgConcurrencyConflictError(error)) {
        throw new ConflictException('Phương án đang được cập nhật đồng thời, vui lòng thử lại');
      }
      throw error;
    }
  }

  /**
   * Lập & xác nhận phiếu xuất hủy (`DISPOSAL`) hoặc trả NCC (`RETURN_TO_SUPPLIER`) trong MỘT DB transaction
   * theo skill `stock-transaction` và tái sử dụng `OutboundReceiptsService.deductLotsInTransaction`.
   * Không áp FEFO bán hàng: cho phép xuất cả lô hết hạn hoặc bị khóa (`blocked`), chỉ chặn lô `closed`.
   */
  async createDisposal(
    id: string,
    dto: CreateExecutionDisposalDto,
    actorUserId: string,
  ): Promise<CreateExecutionDisposalResponse> {
    const quantity = parseDecimalString(dto.quantity, {
      allowZero: false,
      maxScale: 3,
      maxIntegerDigits: 11,
    });
    if (!quantity) {
      throw new BadRequestException({
        message: 'Số lượng xuất phải lớn hơn 0 và tối đa 3 chữ số thập phân',
        errors: [
          {
            field: 'quantity',
            message: 'Số lượng xuất phải lớn hơn 0 và tối đa 3 chữ số thập phân',
          },
        ],
      });
    }

    const confirmedAt = new Date();
    const evaluationDateStr = getVnTodayDateString(confirmedAt);
    const outboundPrefix = buildOutboundNoPrefix(evaluationDateStr);

    for (let attempt = 0; attempt < MAX_OUTBOUND_NO_RETRIES; attempt += 1) {
      try {
        const result = await this.prisma.$transaction(
          async (tx) => {
            // Bước 1: Khóa bi quan phương án thực hiện
            const lockedRows = await tx.$queryRaw<LockedExecutionRow[]>`
              SELECT id, proposal_id, status, planned_qty::text AS planned_qty,
                     actual_qty::text AS actual_qty, linked_outbound_id, started_at
              FROM treatment_executions
              WHERE id = ${id}::uuid
              FOR UPDATE
            `;
            const lockedExec = lockedRows[0];
            if (!lockedExec) {
              throw new NotFoundException('Không tìm thấy phương án thực hiện');
            }
            if (isTerminalExecutionStatus(lockedExec.status)) {
              throw new ConflictException('Phương án đã kết thúc, không thể lập phiếu xuất');
            }

            // Bước 2: Đọc đề xuất & kiểm loại phương án DISPOSE / RETURN_TO_SUPPLIER
            const proposal = await tx.treatmentProposal.findUniqueOrThrow({
              where: { id: lockedExec.proposal_id },
              select: { id: true, lotId: true, actionType: true, status: true },
            });
            const mapping = resolveDisposalConfig(proposal.actionType);
            if (!mapping) {
              throw new BadRequestException(
                'Chỉ phương án hủy hàng hoặc trả nhà cung cấp mới được lập phiếu xuất hủy/trả NCC',
              );
            }

            // Bước 3: Khóa lô & tồn theo đúng thứ tự của OutboundReceiptsService.confirmForOrder (lots → balances)
            const lockedLots = await tx.$queryRaw<LockedLotRow[]>`
              SELECT id, product_id, lot_code, expiry_date::text AS expiry_date, status
              FROM lots
              WHERE id = ${proposal.lotId}::uuid
              FOR UPDATE
            `;
            const lot = lockedLots[0];
            if (!lot) {
              throw new NotFoundException('Không tìm thấy lô hàng của đề xuất');
            }
            if (lot.status === 'closed') {
              throw new ConflictException('Lô hàng đã đóng, không thể lập phiếu xuất');
            }

            const lockedBalances = await tx.$queryRaw<LockedBalanceRow[]>`
              SELECT lot_id, on_hand_qty::text AS on_hand_qty, version
              FROM inventory_lot_balances
              WHERE lot_id = ${proposal.lotId}::uuid
              FOR UPDATE
            `;
            const currentOnHand = lockedBalances[0]
              ? new Prisma.Decimal(lockedBalances[0].on_hand_qty)
              : new Prisma.Decimal(0);

            // Bước 4: Kiểm số lượng <= tồn lô và <= phần còn lại của planned_qty trong transaction
            if (quantity.gt(currentOnHand)) {
              throw new ConflictException(
                `Số lượng xuất (${quantity.toString()}) vượt tồn hiện tại của lô (${currentOnHand.toString()})`,
              );
            }

            const plannedQty = new Prisma.Decimal(lockedExec.planned_qty);
            const currentActual =
              lockedExec.actual_qty !== null ? new Prisma.Decimal(lockedExec.actual_qty) : ZERO;
            const remainingPlanned = plannedQty.sub(currentActual);
            if (quantity.gt(remainingPlanned)) {
              throw new ConflictException(
                `Số lượng xuất (${quantity.toString()}) vượt phần còn lại của lượng đề xuất (${remainingPlanned.toString()})`,
              );
            }

            // Bước 5: Sinh số phiếu xuất PXYYMMDDxxxx và tạo chứng từ xuất đã xác nhận
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

            const defaultNote =
              mapping.outboundType === 'DISPOSAL'
                ? 'Xuất hủy theo phương án xử lý'
                : 'Xuất trả nhà cung cấp theo phương án xử lý';
            const receiptNotes = dto.notes ?? defaultNote;

            const receipt = await tx.outboundReceipt.create({
              data: {
                outboundNo,
                outboundType: mapping.outboundType,
                orderId: null,
                status: 'confirmed',
                createdBy: actorUserId,
                confirmedBy: actorUserId,
                confirmedAt,
                notes: receiptNotes,
                items: {
                  create: [
                    {
                      orderItemId: null,
                      lotId: proposal.lotId,
                      quantity,
                      createdAt: confirmedAt,
                    },
                  ],
                },
              },
              select: { id: true, outboundNo: true },
            });

            // Bước 6: Trừ tồn nguyên tử & ghi stock_movements qua hàm dùng chung T-009
            await this.outboundReceiptsService.deductLotsInTransaction(
              tx,
              [{ lotId: proposal.lotId, quantity }],
              {
                movementType: mapping.movementType,
                sourceType: 'OUTBOUND_RECEIPT',
                sourceId: receipt.id,
                actorUserId,
                occurredAt: confirmedAt,
              },
            );

            // Bước 7: Cập nhật execution (điều kiện kép) + lịch sử + đồng bộ trạng thái đề xuất
            const nextStatus: ExecutionStatus =
              lockedExec.status === 'planned' ? 'in_progress' : (lockedExec.status as ExecutionStatus);
            const nextActualQty = currentActual.add(quantity);

            const execUpdate = await tx.treatmentExecution.updateMany({
              where: { id: lockedExec.id, status: { in: ['planned', 'in_progress'] } },
              data: {
                status: nextStatus,
                actualQty: nextActualQty,
                linkedOutboundId: receipt.id,
                startedAt: lockedExec.started_at ?? confirmedAt,
              },
            });
            if (execUpdate.count !== 1) {
              throw new ConflictException(
                'Trạng thái phương án thực hiện đã thay đổi, không thể lập phiếu xuất',
              );
            }

            const historyNote = dto.notes
              ? `${mapping.outboundType === 'DISPOSAL' ? 'Lập phiếu hủy' : 'Lập phiếu trả NCC'} ${receipt.outboundNo}: ${dto.notes}`
              : `${mapping.outboundType === 'DISPOSAL' ? 'Lập phiếu hủy' : 'Lập phiếu trả NCC'} ${receipt.outboundNo}`;

            await tx.treatmentExecutionUpdate.create({
              data: {
                executionId: lockedExec.id,
                status: nextStatus,
                actualQty: quantity,
                note: historyNote,
                occurredOn: new Date(`${evaluationDateStr}T00:00:00.000Z`),
                linkedOutboundId: receipt.id,
                updatedBy: actorUserId,
                updatedAt: confirmedAt,
              },
            });

            const nextProposalStatus = resolveSyncedProposalStatus(proposal.status, nextStatus);
            if (nextProposalStatus) {
              await tx.treatmentProposal.update({
                where: { id: proposal.id },
                data: { status: nextProposalStatus },
              });
            }

            // Bước 8: Audit log trong cùng transaction
            await writeAuditLog(tx, {
              actorUserId,
              eventType: 'OUTBOUND_CONFIRMED',
              entityType: 'outbound_receipt',
              entityId: receipt.id,
              newData: {
                outboundNo: receipt.outboundNo,
                outboundType: mapping.outboundType,
                executionId: lockedExec.id,
                proposalId: proposal.id,
                lotId: proposal.lotId,
                lotCode: lot.lot_code,
                quantity: quantity.toString(),
              },
            });
            await writeAuditLog(tx, {
              actorUserId,
              eventType: 'EXECUTION_DISPOSAL_CREATED',
              entityType: 'treatment_execution',
              entityId: lockedExec.id,
              oldData: {
                status: lockedExec.status,
                actualQty: lockedExec.actual_qty,
              },
              newData: {
                status: nextStatus,
                actualQtyAfter: nextActualQty.toString(),
                outboundReceiptId: receipt.id,
                outboundNo: receipt.outboundNo,
                outboundType: mapping.outboundType,
              },
            });

            // Bước 9: Đọc lại chi tiết execution & phiếu xuất từ tx
            const [executionRecord, outboundRecord] = await Promise.all([
              tx.treatmentExecution.findUniqueOrThrow({
                where: { id: lockedExec.id },
                select: EXECUTION_SELECT,
              }),
              tx.outboundReceipt.findUniqueOrThrow({
                where: { id: receipt.id },
                select: OUTBOUND_RECEIPT_DETAIL_SELECT,
              }),
            ]);

            return {
              execution: toExecutionDetail(executionRecord),
              outboundReceipt: toOutboundDetailResponse(outboundRecord),
            };
          },
          { timeout: 10_000 },
        );

        // Hook sau commit (ngoài transaction): kích hoạt phân tích nền khi tồn kho thay đổi
        try {
          this.analysisTrigger?.notifyStockChanged({
            sourceType: 'OUTBOUND_RECEIPT',
            sourceId: result.outboundReceipt.id,
            receiptNo: result.outboundReceipt.outboundNo,
          });
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Lỗi gọi hook STOCK_CHANGE sau xác nhận phiếu ${result.outboundReceipt.outboundNo}: ${detail}`,
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

  /**
   * Liên kết một phiếu xuất ORDER đã xác nhận có chứa lô của đề xuất vào phương án thực hiện.
   * Không thay đổi tồn kho (tồn đã giảm khi xác nhận phiếu xuất ORDER).
   */
  async linkOutbound(
    id: string,
    dto: LinkExecutionOutboundDto,
    actorUserId: string,
  ): Promise<ExecutionDetailResponse> {
    const now = new Date();
    const todayVn = getVnTodayDateString(now);

    try {
      const updated = await this.prisma.$transaction(
        async (tx) => {
          const lockedRows = await tx.$queryRaw<LockedExecutionRow[]>`
            SELECT id, proposal_id, status, planned_qty::text AS planned_qty,
                   actual_qty::text AS actual_qty, linked_outbound_id, started_at
            FROM treatment_executions
            WHERE id = ${id}::uuid
            FOR UPDATE
          `;
          const lockedExec = lockedRows[0];
          if (!lockedExec) {
            throw new NotFoundException('Không tìm thấy phương án thực hiện');
          }
          if (isTerminalExecutionStatus(lockedExec.status)) {
            throw new ConflictException('Phương án đã kết thúc, không thể liên kết thêm phiếu xuất');
          }

          const proposal = await tx.treatmentProposal.findUniqueOrThrow({
            where: { id: lockedExec.proposal_id },
            select: { id: true, lotId: true, actionType: true, status: true },
          });
          if (!canLinkOrderOutbound(proposal.actionType)) {
            throw new BadRequestException(
              'Chỉ phương án liên hệ đại lý hoặc ưu tiên FEFO mới được liên kết phiếu xuất theo đơn',
            );
          }

          const receipt = await tx.outboundReceipt.findUnique({
            where: { id: dto.outboundReceiptId },
            select: {
              id: true,
              outboundNo: true,
              outboundType: true,
              status: true,
              items: {
                where: { lotId: proposal.lotId },
                select: { quantity: true },
              },
            },
          });
          if (!receipt) {
            throw new NotFoundException('Không tìm thấy phiếu xuất kho');
          }
          if (receipt.outboundType !== 'ORDER' || receipt.status !== 'confirmed') {
            throw new BadRequestException(
              'Chỉ được liên kết phiếu xuất theo đơn hàng (ORDER) đã xác nhận',
            );
          }

          let lotQtyInReceipt = new Prisma.Decimal(0);
          for (const item of receipt.items) {
            lotQtyInReceipt = lotQtyInReceipt.add(item.quantity);
          }
          if (lotQtyInReceipt.lte(0)) {
            throw new BadRequestException('Phiếu xuất không có lô hàng của đề xuất này');
          }

          // Chống liên kết lặp cùng một phiếu cho cùng execution (kiểm cả cột chính lẫn lịch sử + partial unique index DB)
          const existingLink =
            lockedExec.linked_outbound_id === receipt.id
              ? true
              : Boolean(
                  await tx.treatmentExecutionUpdate.findFirst({
                    where: {
                      executionId: lockedExec.id,
                      linkedOutboundId: receipt.id,
                    },
                    select: { id: true },
                  }),
                );
          if (existingLink) {
            throw new ConflictException('Phiếu xuất này đã được liên kết với phương án thực hiện');
          }

          const currentActual =
            lockedExec.actual_qty !== null ? new Prisma.Decimal(lockedExec.actual_qty) : ZERO;
          const nextActualQty = currentActual.add(lotQtyInReceipt);
          const nextStatus: ExecutionStatus =
            lockedExec.status === 'planned' ? 'in_progress' : (lockedExec.status as ExecutionStatus);

          const execUpdate = await tx.treatmentExecution.updateMany({
            where: { id: lockedExec.id, status: { in: ['planned', 'in_progress'] } },
            data: {
              status: nextStatus,
              actualQty: nextActualQty,
              linkedOutboundId: receipt.id,
              startedAt: lockedExec.started_at ?? now,
            },
          });
          if (execUpdate.count !== 1) {
            throw new ConflictException('Trạng thái phương án thực hiện đã thay đổi');
          }

          await tx.treatmentExecutionUpdate.create({
            data: {
              executionId: lockedExec.id,
              status: nextStatus,
              actualQty: lotQtyInReceipt,
              note: `Liên kết phiếu xuất ${receipt.outboundNo}`,
              occurredOn: new Date(`${todayVn}T00:00:00.000Z`),
              linkedOutboundId: receipt.id,
              updatedBy: actorUserId,
              updatedAt: now,
            },
          });

          const nextProposalStatus = resolveSyncedProposalStatus(proposal.status, nextStatus);
          if (nextProposalStatus) {
            await tx.treatmentProposal.update({
              where: { id: proposal.id },
              data: { status: nextProposalStatus },
            });
          }

          await writeAuditLog(tx, {
            actorUserId,
            eventType: 'EXECUTION_OUTBOUND_LINKED',
            entityType: 'treatment_execution',
            entityId: lockedExec.id,
            oldData: {
              status: lockedExec.status,
              actualQty: lockedExec.actual_qty,
              linkedOutboundId: lockedExec.linked_outbound_id,
            },
            newData: {
              status: nextStatus,
              actualQtyAfter: nextActualQty.toString(),
              linkedOutboundId: receipt.id,
              outboundNo: receipt.outboundNo,
              lotQtyInReceipt: lotQtyInReceipt.toString(),
            },
          });

          return tx.treatmentExecution.findUniqueOrThrow({
            where: { id: lockedExec.id },
            select: EXECUTION_SELECT,
          });
        },
        { timeout: 10_000 },
      );

      return toExecutionDetail(updated);
    } catch (error) {
      if (isExecutionOutboundDuplicateError(error)) {
        throw new ConflictException('Phiếu xuất này đã được liên kết với phương án thực hiện');
      }
      if (isPgConcurrencyConflictError(error)) {
        throw new ConflictException('Phương án đang được xử lý đồng thời, vui lòng thử lại');
      }
      throw error;
    }
  }
}
