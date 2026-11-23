import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../catalog/dto/catalog-common.dto';

export class UpdateLotStatusDto {
  @ApiProperty({ enum: ['active', 'blocked'], description: 'Trạng thái mới của lô hàng' })
  @IsIn(['active', 'blocked'], { message: 'Trạng thái lô chỉ chấp nhận active hoặc blocked' })
  status!: 'active' | 'blocked';

  @ApiProperty({ description: 'Lý do khóa hoặc mở khóa lô hàng (bắt buộc)' })
  @Transform(trimString)
  @IsString({ message: 'Lý do phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do khóa hoặc mở khóa lô' })
  @MaxLength(500, { message: 'Lý do tối đa 500 ký tự' })
  reason!: string;
}
