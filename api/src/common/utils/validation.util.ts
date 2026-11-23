import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';
import { FieldValidationError } from '../filters/http-exception.filter';

export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): FieldValidationError[] {
  const result: FieldValidationError[] = [];

  for (const error of errors) {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;

    if (error.constraints) {
      for (const message of Object.values(error.constraints)) {
        result.push({ field, message });
      }
    }

    if (error.children && error.children.length > 0) {
      result.push(...flattenValidationErrors(error.children, field));
    }
  }

  return result;
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) => {
      const formatted = flattenValidationErrors(errors);
      return new BadRequestException({
        message: 'Dữ liệu đầu vào không hợp lệ',
        errors: formatted,
      });
    },
  });
}
