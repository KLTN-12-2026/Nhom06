import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ActualDemandSyncService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Đồng bộ lịch sử nhu cầu thực tế (`ACTUAL`) vào `demand_history` từ các dòng biến động xuất kho
   * của phiếu xuất theo đơn đại lý đã xác nhận (D-017, T-013 AC3).
   * - Nhóm theo ngày nghiệp vụ `Asia/Ho_Chi_Minh`.
   * - Idempotent: ghi đè tổng xuất theo ngày nếu `(product_id, history_date, 'ACTUAL')` đã tồn tại.
   */
  async syncFromConfirmedOrderOutbounds(): Promise<number> {
    const affectedRows = await this.prisma.$executeRaw`
      INSERT INTO demand_history (product_id, history_date, qty, source)
      SELECT
        l.product_id,
        (sm.occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS history_date,
        SUM(ABS(sm.quantity_delta)) AS qty,
        'ACTUAL' AS source
      FROM stock_movements sm
      INNER JOIN lots l ON l.id = sm.lot_id
      INNER JOIN outbound_receipts obr ON obr.id = sm.source_id
      WHERE sm.movement_type = 'OUTBOUND'
        AND sm.source_type = 'OUTBOUND_RECEIPT'
        AND obr.outbound_type = 'ORDER'
        AND obr.status = 'confirmed'
      GROUP BY l.product_id, (sm.occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
      ON CONFLICT (product_id, history_date, source)
      DO UPDATE SET qty = EXCLUDED.qty
    `;

    return Number(affectedRows);
  }
}
