import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  trimOptionalToNull,
  trimOptionalToUndefined,
  trimString,
} from '../../catalog/dto/catalog-common.dto';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function coerceScalarToString({ value }: { value: unknown }): unknown {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : value;
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return value;
}

export class AgencyOrderItemDto {
  @ApiProperty({ description: 'ID sản phẩm (UUID)' })
  @IsUUID('4', { message: 'Mã sản phẩm không đúng định dạng UUID' })
  productId!: string;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'number' }],
    example: '50',
    description: 'Số lượng đặt (> 0, tối đa 3 chữ số thập phân)',
  })
  @IsDefined({ message: 'Số lượng đặt là bắt buộc' })
  @Transform(coerceScalarToString)
  @IsString({ message: 'Số lượng đặt không hợp lệ' })
  requestedQty!: string;
}

export class CreateAgencyOrderDto {
  @ApiProperty({ description: 'ID đại lý (UUID)' })
  @IsUUID('4', { message: 'Mã đại lý không đúng định dạng UUID' })
  agencyId!: string;

  @ApiProperty({ example: '2026-11-23', description: 'Ngày đặt hàng (YYYY-MM-DD)' })
  @IsString({ message: 'Ngày đặt hàng không hợp lệ' })
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày đặt hàng phải có định dạng YYYY-MM-DD' })
  orderDate!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Ghi chú đơn hàng' })
  @IsOptional()
  @Transform(trimOptionalToNull)
  @IsString({ message: 'Ghi chú không hợp lệ' })
  notes?: string | null;

  @ApiProperty({ type: [AgencyOrderItemDto], description: 'Danh sách mặt hàng đặt (>= 1 dòng)' })
  @IsArray({ message: 'Danh sách mặt hàng phải là mảng' })
  @ArrayMinSize(1, { message: 'Đơn hàng phải có ít nhất 1 mặt hàng' })
  @ValidateNested({ each: true })
  @Type(() => AgencyOrderItemDto)
  items!: AgencyOrderItemDto[];
}

export class UpdateAgencyOrderDto extends CreateAgencyOrderDto {}

export class CancelAgencyOrderDto {
  @ApiProperty({ description: 'Lý do hủy đơn hàng (bắt buộc)' })
  @Transform(trimString)
  @IsString({ message: 'Lý do hủy không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do hủy đơn hàng' })
  @MaxLength(500, { message: 'Lý do hủy tối đa 500 ký tự' })
  reason!: string;
}

export class ListAgencyOrdersQueryDto {
  @ApiPropertyOptional({ enum: ['confirmed', 'partial', 'fulfilled', 'cancelled'] })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsIn(['confirmed', 'partial', 'fulfilled', 'cancelled'], {
    message: 'Trạng thái lọc không hợp lệ',
  })
  status?: 'confirmed' | 'partial' | 'fulfilled' | 'cancelled';

  @ApiPropertyOptional({ description: 'Lọc theo đại lý (UUID)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsUUID('4', { message: 'Mã đại lý không đúng định dạng UUID' })
  agencyId?: string;

  @ApiPropertyOptional({ example: '2026-11-01', description: 'Từ ngày đặt (YYYY-MM-DD)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày bắt đầu phải có định dạng YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Đến ngày đặt (YYYY-MM-DD)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày kết thúc phải có định dạng YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ description: 'Tìm theo số đơn hoặc tên/mã đại lý' })
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

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Kích thước trang phải là số nguyên' })
  @Min(1, { message: 'Kích thước trang tối thiểu là 1' })
  @Max(100, { message: 'Kích thước trang tối đa là 100' })
  pageSize?: number;
}
