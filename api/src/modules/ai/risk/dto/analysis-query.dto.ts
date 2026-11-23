import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class RunAnalysisDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Kỳ dự báo phải là số nguyên' })
  @Min(1, { message: 'Kỳ dự báo tối thiểu 1 ngày' })
  @Max(90, { message: 'Kỳ dự báo tối đa 90 ngày' })
  horizonDays?: number;
}

export class ListAnalysisRunsQueryDto {
  @IsOptional()
  @IsIn(['queued', 'running', 'succeeded', 'failed'], {
    message: 'Trạng thái lượt phân tích không hợp lệ',
  })
  status?: 'queued' | 'running' | 'succeeded' | 'failed';

  @IsOptional()
  @IsIn(['MANUAL', 'SCHEDULED', 'STOCK_CHANGE'], {
    message: 'Nguồn kích hoạt không hợp lệ',
  })
  trigger?: 'MANUAL' | 'SCHEDULED' | 'STOCK_CHANGE';

  @IsOptional()
  @IsString({ message: 'Ngày bắt đầu phải là chuỗi YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @IsString({ message: 'Ngày kết thúc phải là chuỗi YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Giới hạn số dòng phải là số nguyên' })
  @Min(1, { message: 'Giới hạn tối thiểu là 1' })
  @Max(100, { message: 'Giới hạn tối đa là 100' })
  limit?: number;
}

export class LatestRiskQueryDto {
  @IsOptional()
  @IsIn(['critical', 'high', 'medium', 'low'], {
    message: 'Mức rủi ro không hợp lệ',
  })
  riskLevel?: 'critical' | 'high' | 'medium' | 'low';

  @IsOptional()
  @IsUUID('4', { message: 'Mã sản phẩm không hợp lệ' })
  productId?: string;
}

export class LotRiskDetailQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'Mã lượt phân tích không hợp lệ' })
  runId?: string;
}
