import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { trimOptionalToUndefined } from '../../catalog/dto/catalog-common.dto';
import {
  EXPIRY_STATUS_FILTER_VALUES,
  ExpiryStatusFilter,
  LOT_STATUS_VALUES,
  LotStatus,
} from '../domain/inventory-policy';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse tường minh query param boolean từ raw object để tránh bẫy `Boolean('false') === true`.
 */
function parseOptionalBooleanQuery({
  obj,
  key,
  value,
}: {
  obj?: Record<string, unknown>;
  key?: string;
  value: unknown;
}): unknown {
  const raw = obj && key && key in obj ? obj[key] : value;
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  if (typeof raw === 'boolean') {
    return raw;
  }
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }
  return raw;
}

export class InventorySummaryQueryDto {
  @ApiPropertyOptional({ description: 'Lọc chính xác theo ID lô hàng (UUID)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsUUID('4', { message: 'Mã lô không đúng định dạng UUID' })
  lotId?: string;

  @ApiPropertyOptional({ description: 'Tìm theo mã lô, mã sản phẩm hoặc tên sản phẩm' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsString({ message: 'Từ khóa tìm kiếm không hợp lệ' })
  search?: string;

  @ApiPropertyOptional({ description: 'Lọc theo ID nhóm hàng (UUID)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsUUID('4', { message: 'Mã nhóm hàng không đúng định dạng UUID' })
  groupId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo ID sản phẩm (UUID)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsUUID('4', { message: 'Mã sản phẩm không đúng định dạng UUID' })
  productId?: string;

  @ApiPropertyOptional({
    enum: EXPIRY_STATUS_FILTER_VALUES,
    description:
      'Lọc theo tình trạng hạn dùng (near_expiry gộp critical và warning cho bộ lọc "Cận hạn")',
  })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsIn(EXPIRY_STATUS_FILTER_VALUES, { message: 'Tình trạng hạn dùng không hợp lệ' })
  expiryStatus?: ExpiryStatusFilter;

  @ApiPropertyOptional({ example: '2026-11-01', description: 'Hạn sử dụng từ ngày (YYYY-MM-DD)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày bắt đầu HSD phải có định dạng YYYY-MM-DD' })
  expiryFrom?: string;

  @ApiPropertyOptional({ example: '2027-12-31', description: 'Hạn sử dụng đến ngày (YYYY-MM-DD)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày kết thúc HSD phải có định dạng YYYY-MM-DD' })
  expiryTo?: string;

  @ApiPropertyOptional({ enum: LOT_STATUS_VALUES, description: 'Trạng thái lô hàng' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsIn(LOT_STATUS_VALUES, { message: 'Trạng thái lô không hợp lệ' })
  lotStatus?: LotStatus;

  @ApiPropertyOptional({
    default: false,
    description: 'Hiển thị cả các lô có tồn bằng 0 (mặc định false)',
  })
  @IsOptional()
  @Transform(parseOptionalBooleanQuery)
  @IsBoolean({ message: 'Tham số includeEmpty phải là true hoặc false' })
  includeEmpty?: boolean;
}

export class ListInventoryLotsQueryDto extends InventorySummaryQueryDto {
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
