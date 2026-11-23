import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ProductForecastQueryDto {
  @ApiPropertyOptional({
    description: 'Mã lượt chạy dự báo (mặc định lấy lượt FORECAST succeeded mới nhất)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'runId phải là UUID hợp lệ' })
  runId?: string;
}
