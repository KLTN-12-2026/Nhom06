import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export function trimUppercase({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export function trimOptionalToUndefined({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function trimOptionalToNull({ value }: { value: unknown }): unknown {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export class UpdateCatalogStatusDto {
  @ApiProperty({ enum: ['active', 'inactive'] })
  @IsIn(['active', 'inactive'], { message: 'Trạng thái phải là active hoặc inactive' })
  status!: 'active' | 'inactive';
}

export class ListProductGroupsQueryDto {
  @ApiPropertyOptional({ enum: ['active', 'inactive'], description: 'Lọc theo trạng thái' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsIn(['active', 'inactive'], { message: 'Trạng thái lọc không hợp lệ' })
  status?: 'active' | 'inactive';
}

export class ListCatalogQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo mã hoặc tên' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsString({ message: 'Từ khóa tìm kiếm không hợp lệ' })
  search?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive'], description: 'Lọc theo trạng thái' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsIn(['active', 'inactive'], { message: 'Trạng thái lọc không hợp lệ' })
  status?: 'active' | 'inactive';
}

export class ListProductsQueryDto extends ListCatalogQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo ID nhóm hàng (UUID)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsUUID('4', { message: 'Mã nhóm hàng không đúng định dạng UUID' })
  groupId?: string;

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
