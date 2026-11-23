import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class RunForecastDto {
  @ApiPropertyOptional({
    description: 'Số ngày cần dự báo (1–90, mặc định 60)',
    default: 60,
    minimum: 1,
    maximum: 90,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'horizonDays phải là số nguyên' })
  @Min(1, { message: 'horizonDays tối thiểu là 1' })
  @Max(90, { message: 'horizonDays tối đa là 90' })
  horizonDays?: number;
}
