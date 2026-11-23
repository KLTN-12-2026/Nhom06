import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { trimOptionalToUndefined } from '../../catalog/dto/catalog-common.dto';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ListAuditLogsQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo mã sự kiện (vd: USER_LOCKED, INBOUND_CONFIRMED)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsString({ message: 'Mã sự kiện không hợp lệ' })
  eventType?: string;

  @ApiPropertyOptional({ description: 'Lọc theo loại đối tượng (vd: user, inbound_receipt)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsString({ message: 'Loại đối tượng không hợp lệ' })
  entityType?: string;

  @ApiPropertyOptional({ description: 'Lọc theo ID người thực hiện (UUID)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsUUID('4', { message: 'Mã người thực hiện không đúng định dạng UUID' })
  actorUserId?: string;

  @ApiPropertyOptional({ example: '2026-11-01', description: 'Từ ngày VN (YYYY-MM-DD)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày bắt đầu phải có định dạng YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Đến ngày VN (YYYY-MM-DD)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày kết thúc phải có định dạng YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ description: 'Tìm theo mã đối tượng, mã/tên chứng từ hoặc người thực hiện' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsString({ message: 'Từ khóa tìm kiếm không hợp lệ' })
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số trang phải là số nguyên' })
  @Min(1, { message: 'Số trang tối thiểu là 1' })
  page?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Kích thước trang phải là số nguyên' })
  @Min(1, { message: 'Kích thước trang tối thiểu là 1' })
  @Max(200, { message: 'Kích thước trang tối đa là 200' })
  pageSize?: number;
}
