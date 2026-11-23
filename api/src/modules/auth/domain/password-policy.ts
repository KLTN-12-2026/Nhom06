import { BadRequestException } from '@nestjs/common';

export const MIN_NEW_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 100;
export const BCRYPT_COST = 10;

export function assertPasswordConfirmationMatch(
  newPassword: string,
  confirmPassword: string,
): void {
  if (newPassword !== confirmPassword) {
    throw new BadRequestException({
      message: 'Dữ liệu đầu vào không hợp lệ',
      errors: [
        {
          field: 'confirmPassword',
          message: 'Mật khẩu nhập lại không khớp',
        },
      ],
    });
  }
}

export function assertNewPasswordDifferent(currentPassword: string, newPassword: string): void {
  if (currentPassword === newPassword) {
    throw new BadRequestException({
      message: 'Mật khẩu mới không được trùng mật khẩu hiện tại',
      errors: [
        {
          field: 'newPassword',
          message: 'Mật khẩu mới không được trùng mật khẩu hiện tại',
        },
      ],
    });
  }
}
