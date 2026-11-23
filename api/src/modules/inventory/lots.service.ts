import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { writeAuditLog } from '../../common/utils/audit-log.util';
import { PrismaService } from '../../prisma/prisma.service';
import { formatUtcDate, isValidIsoDate, toUtcDate } from '../inbound/domain/inbound-policy';
import { ListLotsQueryDto } from './dto/list-lots-query.dto';
import { UpdateLotStatusDto } from './dto/update-lot-status.dto';

export interface LotResponse {
  id: string;
  lotCode: string;
  product: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  supplier: {
    id: string;
    code: string;
    name: string;
  } | null;
  manufacturedDate: string | null;
  expiryDate: string;
  receivedAt: string;
  initialQuantity: string;
  onHandQty: string;
  status: string;
}

export interface LotListResponse {
  items: LotResponse[];
  total: number;
  page: number;
  pageSize: number;
}

const LOT_SELECT = {
  id: true,
  lotCode: true,
  manufacturedDate: true,
  expiryDate: true,
  receivedAt: true,
  initialQuantity: true,
  status: true,
  product: {
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
    },
  },
  supplier: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  balance: {
    select: {
      onHandQty: true,
    },
  },
} satisfies Prisma.LotSelect;

@Injectable()
export class LotsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListLotsQueryDto): Promise<LotListResponse> {
    if (query.expiryFrom && !isValidIsoDate(query.expiryFrom)) {
      throw new BadRequestException({
        message: 'Ngày bắt đầu HSD không hợp lệ',
        errors: [{ field: 'expiryFrom', message: 'Ngày bắt đầu HSD không hợp lệ' }],
      });
    }
    if (query.expiryTo && !isValidIsoDate(query.expiryTo)) {
      throw new BadRequestException({
        message: 'Ngày kết thúc HSD không hợp lệ',
        errors: [{ field: 'expiryTo', message: 'Ngày kết thúc HSD không hợp lệ' }],
      });
    }
    if (query.expiryFrom && query.expiryTo && query.expiryFrom > query.expiryTo) {
      throw new BadRequestException({
        message: 'Ngày bắt đầu HSD phải nhỏ hơn hoặc bằng ngày kết thúc',
        errors: [
          {
            field: 'expiryFrom',
            message: 'Ngày bắt đầu HSD phải nhỏ hơn hoặc bằng ngày kết thúc',
          },
        ],
      });
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const where: Prisma.LotWhereInput = {};
    if (query.productId) {
      where.productId = query.productId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.expiryFrom || query.expiryTo) {
      where.expiryDate = {
        ...(query.expiryFrom ? { gte: toUtcDate(query.expiryFrom) } : {}),
        ...(query.expiryTo ? { lte: toUtcDate(query.expiryTo) } : {}),
      };
    }
    if (query.search) {
      where.OR = [
        { lotCode: { contains: query.search, mode: 'insensitive' } },
        { product: { code: { contains: query.search, mode: 'insensitive' } } },
        { product: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [total, lots] = await Promise.all([
      this.prisma.lot.count({ where }),
      this.prisma.lot.findMany({
        where,
        select: LOT_SELECT,
        orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }, { lotCode: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: lots.map((lot) => ({
        id: lot.id,
        lotCode: lot.lotCode,
        product: lot.product,
        supplier: lot.supplier,
        manufacturedDate: lot.manufacturedDate ? formatUtcDate(lot.manufacturedDate) : null,
        expiryDate: formatUtcDate(lot.expiryDate),
        receivedAt: formatUtcDate(lot.receivedAt),
        initialQuantity: lot.initialQuantity.toString(),
        onHandQty: lot.balance ? lot.balance.onHandQty.toString() : '0',
        status: lot.status,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Khóa hoặc mở khóa lô hàng (active ↔ blocked, D-024):
   * - Không làm thay đổi tồn kho hay tạo stock_movements.
   * - Lô closed trả 409; đổi sang trạng thái trùng hiện tại trả 409.
   * - Ghi audit LOT_BLOCKED / LOT_UNBLOCKED trong cùng transaction.
   */
  async updateStatus(
    id: string,
    dto: UpdateLotStatusDto,
    actorUserId: string,
  ): Promise<LotResponse> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<Array<{ id: string; lot_code: string; status: string }>>`
        SELECT id, lot_code, status
        FROM lots
        WHERE id = ${id}::uuid
        FOR UPDATE
      `;
      const locked = lockedRows[0];
      if (!locked) {
        throw new NotFoundException('Không tìm thấy lô hàng');
      }
      if (locked.status === 'closed') {
        throw new ConflictException('Lô hàng đã đóng, không thể khóa hoặc mở khóa');
      }
      if (locked.status === dto.status) {
        throw new ConflictException(
          dto.status === 'blocked'
            ? 'Lô hàng hiện đang ở trạng thái đã khóa'
            : 'Lô hàng hiện đang ở trạng thái hoạt động',
        );
      }

      const lot = await tx.lot.update({
        where: { id },
        data: { status: dto.status },
        select: LOT_SELECT,
      });

      await writeAuditLog(tx, {
        actorUserId,
        eventType: dto.status === 'blocked' ? 'LOT_BLOCKED' : 'LOT_UNBLOCKED',
        entityType: 'lot',
        entityId: lot.id,
        oldData: { status: locked.status, lotCode: locked.lot_code },
        newData: {
          status: lot.status,
          lotCode: lot.lotCode,
          reason: dto.reason,
        },
      });

      return lot;
    });

    return {
      id: updated.id,
      lotCode: updated.lotCode,
      product: updated.product,
      supplier: updated.supplier,
      manufacturedDate: updated.manufacturedDate ? formatUtcDate(updated.manufacturedDate) : null,
      expiryDate: formatUtcDate(updated.expiryDate),
      receivedAt: formatUtcDate(updated.receivedAt),
      initialQuantity: updated.initialQuantity.toString(),
      onHandQty: updated.balance ? updated.balance.onHandQty.toString() : '0',
      status: updated.status,
    };
  }
}
