import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class LinkExecutionOutboundDto {
  @ApiProperty({ description: 'ID phiếu xuất kho loại ORDER đã xác nhận (UUID)' })
  @IsUUID('4', { message: 'Mã phiếu xuất không đúng định dạng UUID' })
  outboundReceiptId!: string;
}
