import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'nhanvien2@kho-ai.local' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @MaxLength(255, { message: 'Email không được vượt quá 255 ký tự' })
  email?: string;

  @ApiPropertyOptional({ example: 'Lê Văn An' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Họ tên không hợp lệ' })
  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  @MaxLength(150, { message: 'Họ tên không được vượt quá 150 ký tự' })
  fullName?: string;

  @ApiPropertyOptional({ example: '0905123456', nullable: true })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsString({ message: 'Số điện thoại không hợp lệ' })
  @MaxLength(30, { message: 'Số điện thoại không được vượt quá 30 ký tự' })
  phone?: string | null;
}
