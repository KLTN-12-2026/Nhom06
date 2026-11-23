import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

export interface FieldValidationError {
  field: string;
  message: string;
}

interface ErrorResponseBody {
  statusCode: number;
  message: string;
  errors?: FieldValidationError[];
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      const body: ErrorResponseBody = {
        statusCode,
        message: 'Yêu cầu không hợp lệ',
      };

      if (typeof exceptionResponse === 'string') {
        body.message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resObj = exceptionResponse as {
          message?: string | string[];
          errors?: FieldValidationError[];
        };
        if (typeof resObj.message === 'string') {
          body.message = resObj.message;
        } else if (Array.isArray(resObj.message) && resObj.message.length > 0) {
          body.message = resObj.message.join(', ');
        }
        if (Array.isArray(resObj.errors) && resObj.errors.length > 0) {
          body.errors = resObj.errors;
        }
      }

      response.status(statusCode).json(body);
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        response.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: 'Dữ liệu đã tồn tại trong hệ thống',
        } satisfies ErrorResponseBody);
        return;
      }
      if (exception.code === 'P2025') {
        response.status(HttpStatus.NOT_FOUND).json({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Không tìm thấy bản ghi yêu cầu',
        } satisfies ErrorResponseBody);
        return;
      }
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Lỗi hệ thống, vui lòng thử lại sau',
    } satisfies ErrorResponseBody);
  }
}
