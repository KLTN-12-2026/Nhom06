import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ListExpiryAlertsQueryDto {
  @ApiPropertyOptional({ example: '2026-11-23', description: 'Ngày đánh giá (YYYY-MM-DD)' })
  @IsOptional()
  @IsString({ message: 'Ngày đánh giá không hợp lệ' })
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày đánh giá phải có định dạng YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({ enum: ['expired', 'critical', 'warning'] })
  @IsOptional()
  @IsIn(['expired', 'critical', 'warning'], {
    message: 'Mức cảnh báo chỉ nhận expired, critical hoặc warning',
  })
  severity?: 'expired' | 'critical' | 'warning';

  @ApiPropertyOptional({ description: 'Lọc theo sản phẩm (UUID)' })
  @IsOptional()
  @IsUUID('4', { message: 'ID sản phẩm không đúng định dạng UUID' })
  productId?: string;

  @ApiPropertyOptional({ example: '2026-11-01', description: 'Hạn sử dụng từ (YYYY-MM-DD)' })
  @IsOptional()
  @IsString({ message: 'Ngày bắt đầu khoảng HSD không hợp lệ' })
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày bắt đầu khoảng HSD phải có định dạng YYYY-MM-DD' })
  expiryFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Hạn sử dụng đến (YYYY-MM-DD)' })
  @IsOptional()
  @IsString({ message: 'Ngày kết thúc khoảng HSD không hợp lệ' })
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày kết thúc khoảng HSD phải có định dạng YYYY-MM-DD' })
  expiryTo?: string;

  @ApiPropertyOptional({ example: 30, description: 'Số ngày còn lại tối đa' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số ngày còn lại tối đa phải là số nguyên' })
  maxDaysRemaining?: number;

  @ApiPropertyOptional({ description: 'Tìm theo mã lô, mã hoặc tên sản phẩm' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Từ khóa tìm kiếm không hợp lệ' })
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Trang phải là số nguyên dương' })
  @Min(1, { message: 'Trang phải lớn hơn hoặc bằng 1' })
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Kích thước trang phải là số nguyên dương' })
  @Min(1, { message: 'Kích thước trang phải lớn hơn hoặc bằng 1' })
  @Max(200, { message: 'Kích thước trang tối đa là 200' })
  pageSize?: number;
}

export class ExpiryAlertsSummaryQueryDto {
  @ApiPropertyOptional({ example: '2026-11-23', description: 'Ngày đánh giá (YYYY-MM-DD)' })
  @IsOptional()
  @IsString({ message: 'Ngày đánh giá không hợp lệ' })
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày đánh giá phải có định dạng YYYY-MM-DD' })
  date?: string;
}

export class EvaluateExpiryAlertsDto {
  @ApiPropertyOptional({ example: '2026-11-23', description: 'Ngày đánh giá (YYYY-MM-DD)' })
  @IsOptional()
  @IsString({ message: 'Ngày đánh giá không hợp lệ' })
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày đánh giá phải có định dạng YYYY-MM-DD' })
  date?: string;
}
