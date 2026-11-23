import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'nhanvien2' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Tên đăng nhập không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập tên đăng nhập' })
  @MinLength(3, { message: 'Tên đăng nhập phải có ít nhất 3 ký tự' })
  @MaxLength(100, { message: 'Tên đăng nhập không được vượt quá 100 ký tự' })
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'Tên đăng nhập chỉ được gồm chữ cái, chữ số và ký tự . _ -',
  })
  username!: string;

  @ApiProperty({ example: 'nhanvien2@kho-ai.local' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @MaxLength(255, { message: 'Email không được vượt quá 255 ký tự' })
  email!: string;

  @ApiProperty({ example: 'Lê Văn An' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Họ tên không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập họ tên' })
  @MaxLength(150, { message: 'Họ tên không được vượt quá 150 ký tự' })
  fullName!: string;

  @ApiPropertyOptional({ example: '0905123456' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString({ message: 'Số điện thoại không hợp lệ' })
  @MaxLength(30, { message: 'Số điện thoại không được vượt quá 30 ký tự' })
  phone?: string;

  @ApiProperty({ example: '123456', minLength: 6 })
  @IsString({ message: 'Mật khẩu không hợp lệ' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  @MaxLength(100, { message: 'Mật khẩu không được vượt quá 100 ký tự' })
  password!: string;

  @ApiProperty({ example: 'WAREHOUSE_STAFF', enum: ['ADMIN', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'] })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Vai trò không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng chọn vai trò' })
  roleCode!: string;
}
