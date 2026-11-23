import { BadRequestException } from '@nestjs/common';
import {
  assertNewPasswordDifferent,
  assertPasswordConfirmationMatch,
  BCRYPT_COST,
  MAX_PASSWORD_LENGTH,
  MIN_NEW_PASSWORD_LENGTH,
} from './password-policy';

describe('password-policy (domain)', () => {
  it('dùng hằng số chính sách mật khẩu đúng quy định (min 8, max 100, bcrypt cost 10)', () => {
    expect(MIN_NEW_PASSWORD_LENGTH).toBe(8);
    expect(MAX_PASSWORD_LENGTH).toBe(100);
    expect(BCRYPT_COST).toBe(10);
  });

  describe('assertPasswordConfirmationMatch', () => {
    it('cho qua khi newPassword và confirmPassword khớp nhau', () => {
      expect(() =>
        assertPasswordConfirmationMatch('MatKhauMoi123', 'MatKhauMoi123'),
      ).not.toThrow();
    });

    it('ném 400 có errors[].field = confirmPassword khi nhập lại không khớp', () => {
      try {
        assertPasswordConfirmationMatch('MatKhauMoi123', 'KhacMatKhau123');
        fail('Phải ném BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const response = (err as BadRequestException).getResponse() as {
          message: string;
          errors: Array<{ field: string; message: string }>;
        };
        expect(response.errors).toEqual([
          {
            field: 'confirmPassword',
            message: 'Mật khẩu nhập lại không khớp',
          },
        ]);
      }
    });
  });

  describe('assertNewPasswordDifferent', () => {
    it('cho qua khi mật khẩu mới khác mật khẩu hiện tại', () => {
      expect(() => assertNewPasswordDifferent('123456', 'MatKhauMoi123')).not.toThrow();
    });

    it('ném 400 có errors[].field = newPassword khi mật khẩu mới trùng mật khẩu hiện tại', () => {
      try {
        assertNewPasswordDifferent('MatKhauCu123', 'MatKhauCu123');
        fail('Phải ném BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const response = (err as BadRequestException).getResponse() as {
          message: string;
          errors: Array<{ field: string; message: string }>;
        };
        expect(response.message).toBe('Mật khẩu mới không được trùng mật khẩu hiện tại');
        expect(response.errors).toEqual([
          {
            field: 'newPassword',
            message: 'Mật khẩu mới không được trùng mật khẩu hiện tại',
          },
        ]);
      }
    });
  });
});
