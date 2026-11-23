import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'quanly', description: 'Tên đăng nhập nội bộ' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Tên đăng nhập không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập tên đăng nhập' })
  username!: string;

  @ApiProperty({ example: '123456', description: 'Mật khẩu tài khoản' })
  @IsString({ message: 'Mật khẩu không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu' })
  password!: string;
}
