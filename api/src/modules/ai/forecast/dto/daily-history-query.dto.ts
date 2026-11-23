import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class DailyHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Số ngày gần nhất có dữ liệu cần lấy (mặc định 90)',
    default: 90,
    minimum: 1,
    maximum: 365,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'days phải là số nguyên' })
  @Min(1, { message: 'days tối thiểu là 1' })
  @Max(365, { message: 'days tối đa là 365' })
  days?: number;
}
