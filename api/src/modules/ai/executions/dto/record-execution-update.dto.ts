import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { trimOptionalToNull, trimOptionalToUndefined } from '../../../catalog/dto/catalog-common.dto';
import { EXECUTION_STATUSES, ExecutionStatus } from '../domain/execution-policy';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function coerceOptionalScalarToString({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return value;
}

export class RecordExecutionUpdateDto {
  @ApiProperty({ enum: EXECUTION_STATUSES, description: 'Trạng thái tiến độ mới' })
  @IsIn(EXECUTION_STATUSES, { message: 'Trạng thái thực hiện không hợp lệ' })
  status!: ExecutionStatus;

  @ApiPropertyOptional({
    oneOf: [{ type: 'string' }, { type: 'number' }],
    example: '120',
    description: 'Số lượng thực tế ghi nhận thêm (>= 0, tối đa 3 chữ số thập phân)',
  })
  @IsOptional()
  @Transform(coerceOptionalScalarToString)
  @IsString({ message: 'Lượng thực tế không hợp lệ' })
  actualQtyDelta?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Ghi chú (bắt buộc khi failed/cancelled hoặc tổng vượt lượng đề xuất)',
  })
  @IsOptional()
  @Transform(trimOptionalToNull)
  @IsString({ message: 'Ghi chú không hợp lệ' })
  note?: string | null;

  @ApiPropertyOptional({ example: '2026-11-23', description: 'Ngày thực hiện (YYYY-MM-DD)' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày thực hiện phải có định dạng YYYY-MM-DD' })
  occurredOn?: string;
}
