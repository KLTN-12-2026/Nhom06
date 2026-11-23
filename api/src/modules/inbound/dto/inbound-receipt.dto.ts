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

function coerceOptionalScalarToNull({ value }: { value: unknown }): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  return value;
}

export class InboundReceiptItemDto {
  @ApiProperty({ description: 'ID sản phẩm (UUID)' })
  @IsUUID('4', { message: 'Mã sản phẩm không đúng định dạng UUID' })
  productId!: string;

  @ApiProperty({ description: 'Mã lô (1–80 ký tự, tự chuẩn hóa in hoa và bỏ khoảng trắng)' })
  @IsString({ message: 'Mã lô không hợp lệ' })
  lotCode!: string;

  @ApiProperty({ example: '2027-06-01', description: 'Hạn sử dụng (YYYY-MM-DD)' })
  @IsString({ message: 'Hạn sử dụng không hợp lệ' })
  @Matches(ISO_DATE_PATTERN, { message: 'Hạn sử dụng phải có định dạng YYYY-MM-DD' })
  expiryDate!: string;

  @ApiPropertyOptional({
    example: '2026-11-01',
    nullable: true,
    description: 'Ngày sản xuất (YYYY-MM-DD, tùy chọn)',
  })
  @IsOptional()
  @Transform(trimOptionalToNull)
  @IsString({ message: 'Ngày sản xuất không hợp lệ' })
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày sản xuất phải có định dạng YYYY-MM-DD' })
  manufacturedDate?: string | null;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'number' }],
    example: '100',
    description: 'Số lượng nhập (> 0, tối đa 3 chữ số thập phân)',
  })
  @IsDefined({ message: 'Số lượng là bắt buộc' })
  @Transform(coerceScalarToString)
  @IsString({ message: 'Số lượng không hợp lệ' })
  quantity!: string;

  @ApiPropertyOptional({
    oneOf: [{ type: 'string' }, { type: 'number' }],
    nullable: true,
    example: '320000',
    description: 'Đơn giá (>= 0, tối đa 2 chữ số thập phân)',
  })
  @IsOptional()
  @Transform(coerceOptionalScalarToNull)
  @IsString({ message: 'Đơn giá không hợp lệ' })
  unitCost?: string | null;
}

export class CreateInboundReceiptDto {
  @ApiProperty({ description: 'ID nhà cung cấp (UUID)' })
  @IsUUID('4', { message: 'Mã nhà cung cấp không đúng định dạng UUID' })
  supplierId!: string;

  @ApiProperty({ example: '2026-11-22', description: 'Ngày chứng từ (YYYY-MM-DD)' })
  @IsString({ message: 'Ngày chứng từ không hợp lệ' })
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày chứng từ phải có định dạng YYYY-MM-DD' })
  receiptDate!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Ghi chú phiếu nhập' })
  @IsOptional()
  @Transform(trimOptionalToNull)
  @IsString({ message: 'Ghi chú không hợp lệ' })
  notes?: string | null;

  @ApiProperty({ type: [InboundReceiptItemDto], description: 'Danh sách dòng hàng (>= 1 dòng)' })
  @IsArray({ message: 'Danh sách dòng hàng phải là mảng' })
  @ArrayMinSize(1, { message: 'Phiếu nhập phải có ít nhất 1 dòng hàng' })
  @ValidateNested({ each: true })
  @Type(() => InboundReceiptItemDto)
  items!: InboundReceiptItemDto[];
}

export class UpdateInboundReceiptDto extends CreateInboundReceiptDto {}

export class ListInboundReceiptsQueryDto {
  @ApiPropertyOptional({ enum: ['draft', 'confirmed', 'cancelled'] })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsIn(['draft', 'confirmed', 'cancelled'], { message: 'Trạng thái lọc không hợp lệ' })
  status?: 'draft' | 'confirmed' | 'cancelled';

  @ApiPropertyOptional({ description: 'Lọc theo nhà cung cấp (UUID)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsUUID('4', { message: 'Mã nhà cung cấp không đúng định dạng UUID' })
  supplierId?: string;

  @ApiPropertyOptional({ example: '2026-11-01', description: 'Từ ngày chứng từ (YYYY-MM-DD)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày bắt đầu phải có định dạng YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Đến ngày chứng từ (YYYY-MM-DD)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày kết thúc phải có định dạng YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ description: 'Tìm theo số phiếu hoặc nhà cung cấp' })
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
