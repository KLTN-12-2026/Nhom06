import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { trimOptionalToUndefined } from '../../catalog/dto/catalog-common.dto';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ListLotsQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo ID sản phẩm (UUID)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsUUID('4', { message: 'Mã sản phẩm không đúng định dạng UUID' })
  productId?: string;

  @ApiPropertyOptional({ example: '2027-01-01', description: 'Hạn sử dụng từ ngày (YYYY-MM-DD)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày bắt đầu HSD phải có định dạng YYYY-MM-DD' })
  expiryFrom?: string;

  @ApiPropertyOptional({ example: '2027-12-31', description: 'Hạn sử dụng đến ngày (YYYY-MM-DD)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày kết thúc HSD phải có định dạng YYYY-MM-DD' })
  expiryTo?: string;

  @ApiPropertyOptional({ description: 'Tìm theo mã lô hoặc mã/tên sản phẩm' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsString({ message: 'Từ khóa tìm kiếm không hợp lệ' })
  search?: string;

  @ApiPropertyOptional({ enum: ['active', 'blocked', 'closed'] })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsIn(['active', 'blocked', 'closed'], { message: 'Trạng thái lô không hợp lệ' })
  status?: 'active' | 'blocked' | 'closed';

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
