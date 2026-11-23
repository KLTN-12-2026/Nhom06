import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { trimOptionalToUndefined } from '../../catalog/dto/catalog-common.dto';
import {
  MOVEMENT_SOURCE_TYPE_VALUES,
  MOVEMENT_TYPE_VALUES,
  MovementSourceType,
  MovementType,
} from '../domain/inventory-policy';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ListStockMovementsQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo mã lô, mã/tên sản phẩm hoặc số chứng từ' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsString({ message: 'Từ khóa tìm kiếm không hợp lệ' })
  search?: string;

  @ApiPropertyOptional({ enum: MOVEMENT_TYPE_VALUES, description: 'Loại nghiệp vụ biến động' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsIn(MOVEMENT_TYPE_VALUES, { message: 'Loại nghiệp vụ biến động không hợp lệ' })
  movementType?: MovementType;

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

  @ApiPropertyOptional({ enum: MOVEMENT_SOURCE_TYPE_VALUES, description: 'Loại chứng từ nguồn' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsIn(MOVEMENT_SOURCE_TYPE_VALUES, { message: 'Loại chứng từ nguồn không hợp lệ' })
  sourceType?: MovementSourceType;

  @ApiPropertyOptional({ description: 'ID chứng từ nguồn (UUID)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsUUID('4', { message: 'Mã chứng từ nguồn không đúng định dạng UUID' })
  sourceId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo ID lô hàng (UUID)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsUUID('4', { message: 'Mã lô không đúng định dạng UUID' })
  lotId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo ID sản phẩm (UUID)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsUUID('4', { message: 'Mã sản phẩm không đúng định dạng UUID' })
  productId?: string;

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
