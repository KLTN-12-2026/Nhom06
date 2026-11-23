import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class UpdateGlobalThresholdDto {
  @ApiProperty({ example: 30, description: 'Số ngày cảnh báo cận hạn' })
  @Type(() => Number)
  @IsInt({ message: 'Số ngày cảnh báo cận hạn phải là số nguyên' })
  @Min(0, { message: 'Số ngày cảnh báo cận hạn phải lớn hơn hoặc bằng 0' })
  warningDays!: number;

  @ApiProperty({ example: 7, description: 'Số ngày nguy cấp' })
  @Type(() => Number)
  @IsInt({ message: 'Số ngày nguy cấp phải là số nguyên' })
  @Min(0, { message: 'Số ngày nguy cấp phải lớn hơn hoặc bằng 0' })
  criticalDays!: number;

  @ApiProperty({ example: 7, description: 'Hạn dùng tối thiểu khi giao hàng (FEFO)' })
  @Type(() => Number)
  @IsInt({ message: 'Hạn dùng tối thiểu khi giao hàng phải là số nguyên' })
  @Min(0, { message: 'Hạn dùng tối thiểu khi giao hàng phải lớn hơn hoặc bằng 0' })
  minDeliveryDays!: number;
}

export class CreateOverrideThresholdDto {
  @ApiProperty({ enum: ['PRODUCT', 'PRODUCT_GROUP'] })
  @IsIn(['PRODUCT', 'PRODUCT_GROUP'], {
    message: 'Phạm vi ngưỡng riêng phải là PRODUCT hoặc PRODUCT_GROUP',
  })
  scope!: 'PRODUCT' | 'PRODUCT_GROUP';

  @ApiProperty({ description: 'UUID sản phẩm hoặc nhóm hàng' })
  @IsUUID('4', { message: 'ID đối tượng áp dụng không đúng định dạng UUID' })
  targetId!: string;

  @ApiProperty({ example: 10, description: 'Số ngày cảnh báo cận hạn riêng' })
  @Type(() => Number)
  @IsInt({ message: 'Số ngày cảnh báo phải là số nguyên' })
  @Min(0, { message: 'Số ngày cảnh báo phải lớn hơn hoặc bằng 0' })
  warningDays!: number;
}

export class UpdateOverrideThresholdDto {
  @ApiProperty({ example: 15, description: 'Số ngày cảnh báo cận hạn riêng mới' })
  @Type(() => Number)
  @IsInt({ message: 'Số ngày cảnh báo phải là số nguyên' })
  @Min(0, { message: 'Số ngày cảnh báo phải lớn hơn hoặc bằng 0' })
  warningDays!: number;
}

export class ThresholdHistoryQueryDto {
  @ApiPropertyOptional({ enum: ['GLOBAL', 'PRODUCT_GROUP', 'PRODUCT'] })
  @IsOptional()
  @IsIn(['GLOBAL', 'PRODUCT_GROUP', 'PRODUCT'], {
    message: 'Phạm vi phải là GLOBAL, PRODUCT_GROUP hoặc PRODUCT',
  })
  scope?: 'GLOBAL' | 'PRODUCT_GROUP' | 'PRODUCT';

  @ApiPropertyOptional({ description: 'UUID sản phẩm hoặc nhóm hàng' })
  @IsOptional()
  @IsUUID('4', { message: 'ID đối tượng không đúng định dạng UUID' })
  targetId?: string;
}
