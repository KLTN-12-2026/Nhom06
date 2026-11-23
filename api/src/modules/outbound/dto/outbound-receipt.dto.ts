import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  trimOptionalToNull,
  trimOptionalToUndefined,
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

export class ConfirmOrderOutboundItemDto {
  @ApiProperty({ description: 'ID dòng đơn đại lý (UUID)' })
  @IsUUID('4', { message: 'Mã dòng đơn hàng không đúng định dạng UUID' })
  orderItemId!: string;

  @ApiProperty({ description: 'ID lô hàng xuất (UUID)' })
  @IsUUID('4', { message: 'Mã lô không đúng định dạng UUID' })
  lotId!: string;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'number' }],
    example: '30',
    description: 'Số lượng xuất (> 0, tối đa 3 chữ số thập phân)',
  })
  @IsDefined({ message: 'Số lượng xuất là bắt buộc' })
  @Transform(coerceScalarToString)
  @IsString({ message: 'Số lượng xuất không hợp lệ' })
  quantity!: string;
}

export class ConfirmOrderOutboundDto {
  @ApiProperty({
    type: [ConfirmOrderOutboundItemDto],
    description: 'Danh sách dòng lô thực xuất (>= 1 dòng)',
  })
  @IsArray({ message: 'Danh sách dòng xuất phải là mảng' })
  @ArrayMinSize(1, { message: 'Phiếu xuất phải có ít nhất 1 dòng lô cần xuất' })
  @ValidateNested({ each: true })
  @Type(() => ConfirmOrderOutboundItemDto)
  items!: ConfirmOrderOutboundItemDto[];

  @ApiPropertyOptional({ nullable: true, description: 'Ghi chú phiếu xuất' })
  @IsOptional()
  @Transform(trimOptionalToNull)
  @IsString({ message: 'Ghi chú không hợp lệ' })
  notes?: string | null;
}

export class ListOutboundReceiptsQueryDto {
  @ApiPropertyOptional({ enum: ['ORDER', 'RETURN_TO_SUPPLIER', 'DISPOSAL', 'OTHER'] })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsIn(['ORDER', 'RETURN_TO_SUPPLIER', 'DISPOSAL', 'OTHER'], {
    message: 'Loại phiếu xuất không hợp lệ',
  })
  type?: 'ORDER' | 'RETURN_TO_SUPPLIER' | 'DISPOSAL' | 'OTHER';

  @ApiPropertyOptional({ description: 'Lọc theo ID đơn hàng (UUID)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsUUID('4', { message: 'Mã đơn hàng không đúng định dạng UUID' })
  orderId?: string;

  @ApiPropertyOptional({ example: '2026-11-01', description: 'Từ ngày xuất (YYYY-MM-DD, giờ VN)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày bắt đầu phải có định dạng YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Đến ngày xuất (YYYY-MM-DD, giờ VN)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày kết thúc phải có định dạng YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ description: 'Tìm theo số phiếu xuất, số đơn hoặc đại lý' })
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
