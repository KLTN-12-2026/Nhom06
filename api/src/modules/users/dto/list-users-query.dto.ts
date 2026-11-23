import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListUsersQueryDto {
  @ApiPropertyOptional({ description: 'Tìm kiếm theo tên đăng nhập, họ tên hoặc email' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Từ khóa tìm kiếm không hợp lệ' })
  search?: string;

  @ApiPropertyOptional({ enum: ['active', 'locked', 'disabled'], description: 'Lọc theo trạng thái' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsIn(['active', 'locked', 'disabled'], { message: 'Trạng thái lọc không hợp lệ' })
  status?: 'active' | 'locked' | 'disabled';
}
