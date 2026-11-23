import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserStatusDto {
  @ApiProperty({ enum: ['active', 'locked'] })
  @IsIn(['active', 'locked'], { message: 'Trạng thái phải là active hoặc locked' })
  status!: 'active' | 'locked';
}
