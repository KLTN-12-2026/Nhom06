import { Transform } from 'class-transformer';
import { IsOptional, IsUUID, Matches } from 'class-validator';
import { trimOptionalToUndefined } from '../../catalog/dto/catalog-common.dto';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class StockLedgerQueryDto {
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày bắt đầu phải đúng định dạng YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày kết thúc phải đúng định dạng YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsUUID('4', { message: 'Mã nhóm hàng không hợp lệ' })
  groupId?: string;

  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsUUID('4', { message: 'Mã sản phẩm không hợp lệ' })
  productId?: string;

  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsUUID('4', { message: 'Mã lô không hợp lệ' })
  lotId?: string;
}
