import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
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
import { STOCK_COUNT_STATUS_VALUES, StockCountStatus } from '../domain/stock-count-policy';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeQuantityInput({ value }: { value: unknown }): unknown {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : value;
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return value;
}

export class StockCountItemInputDto {
  @ApiProperty({ description: 'ID lô hàng cần kiểm kê (UUID)' })
  @Transform(trimString)
  @IsUUID('4', { message: 'Mã lô không đúng định dạng UUID' })
  lotId!: string;

  @ApiProperty({
    example: '8',
    description: 'Số lượng đếm thực tế (>= 0, tối đa 3 chữ số thập phân)',
  })
  @Transform(normalizeQuantityInput)
  @IsString({ message: 'Số lượng đếm không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập số lượng đếm' })
  countedQty!: string;

  @ApiPropertyOptional({ description: 'Lý do chênh lệch (bắt buộc khi số đếm khác tồn hệ thống)' })
  @IsOptional()
  @Transform(trimOptionalToNull)
  @IsString({ message: 'Lý do chênh lệch phải là chuỗi ký tự' })
  @MaxLength(500, { message: 'Lý do chênh lệch tối đa 500 ký tự' })
  reason?: string | null;
}

export class SaveStockCountDto {
  @ApiProperty({
    example: '2026-11-23T09:00:00+07:00',
    description: 'Thời điểm kiểm đếm thực tế (ISO 8601)',
  })
  @Transform(trimString)
  @IsDateString({}, { message: 'Thời điểm kiểm kê không đúng định dạng ngày giờ ISO 8601' })
  countedAt!: string;

  @ApiPropertyOptional({ description: 'Ghi chú chung của phiếu kiểm kê' })
  @IsOptional()
  @Transform(trimOptionalToNull)
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự' })
  @MaxLength(1000, { message: 'Ghi chú tối đa 1000 ký tự' })
  note?: string | null;

  @ApiProperty({ type: [StockCountItemInputDto], description: 'Danh sách các lô kiểm kê' })
  @IsArray({ message: 'Danh sách dòng kiểm kê phải là mảng' })
  @ArrayMinSize(1, { message: 'Phiếu kiểm kê phải có ít nhất 1 dòng lô hàng' })
  @ValidateNested({ each: true })
  @Type(() => StockCountItemInputDto)
  items!: StockCountItemInputDto[];
}

export class CancelStockCountDto {
  @ApiProperty({ description: 'Lý do hủy phiếu kiểm kê (bắt buộc)' })
  @Transform(trimString)
  @IsString({ message: 'Lý do hủy phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do hủy phiếu kiểm kê' })
  @MaxLength(500, { message: 'Lý do hủy tối đa 500 ký tự' })
  reason!: string;
}

export class ListStockCountsQueryDto {
  @ApiPropertyOptional({ enum: STOCK_COUNT_STATUS_VALUES, description: 'Lọc theo trạng thái phiếu' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsIn(STOCK_COUNT_STATUS_VALUES, { message: 'Trạng thái phiếu kiểm kê không hợp lệ' })
  status?: StockCountStatus;

  @ApiPropertyOptional({ example: '2026-11-01', description: 'Từ ngày kiểm kê VN (YYYY-MM-DD)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày bắt đầu phải có định dạng YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Đến ngày kiểm kê VN (YYYY-MM-DD)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày kết thúc phải có định dạng YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ description: 'Tìm theo số phiếu, ghi chú hoặc người lập' })
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
