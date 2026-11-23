import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { trimOptionalToUndefined } from '../../catalog/dto/catalog-common.dto';

export class MonthlyInOutQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số tháng phải là số nguyên' })
  @Min(1, { message: 'Số tháng phải lớn hơn hoặc bằng 1' })
  @Max(36, { message: 'Số tháng tối đa là 36' })
  months?: number;

  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsUUID('4', { message: 'Mã nhóm hàng không hợp lệ' })
  groupId?: string;
}
