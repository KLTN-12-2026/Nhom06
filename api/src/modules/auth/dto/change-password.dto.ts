import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { MAX_PASSWORD_LENGTH, MIN_NEW_PASSWORD_LENGTH } from '../domain/password-policy';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Mật khẩu hiện tại của tài khoản đang đăng nhập' })
  @IsString({ message: 'Mật khẩu hiện tại không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu hiện tại' })
  currentPassword!: string;

  @ApiProperty({
    description: 'Mật khẩu mới (tối thiểu 8 ký tự, không trùng mật khẩu hiện tại)',
    minLength: MIN_NEW_PASSWORD_LENGTH,
    maxLength: MAX_PASSWORD_LENGTH,
  })
  @IsString({ message: 'Mật khẩu mới không hợp lệ' })
  @MinLength(MIN_NEW_PASSWORD_LENGTH, {
    message: `Mật khẩu mới phải có ít nhất ${MIN_NEW_PASSWORD_LENGTH} ký tự`,
  })
  @MaxLength(MAX_PASSWORD_LENGTH, {
    message: `Mật khẩu mới không được vượt quá ${MAX_PASSWORD_LENGTH} ký tự`,
  })
  newPassword!: string;

  @ApiProperty({ description: 'Nhập lại mật khẩu mới để xác nhận' })
  @IsString({ message: 'Mật khẩu nhập lại không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập lại mật khẩu mới' })
  confirmPassword!: string;
}
