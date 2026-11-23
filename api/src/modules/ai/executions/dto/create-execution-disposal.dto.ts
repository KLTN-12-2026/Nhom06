import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDefined, IsOptional, IsString } from 'class-validator';
import { trimOptionalToNull } from '../../../catalog/dto/catalog-common.dto';

function coerceScalarToString({ value }: { value: unknown }): unknown {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : value;
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return value;
}

export class CreateExecutionDisposalDto {
  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'number' }],
    example: '44',
    description: 'Số lượng xuất hủy hoặc trả nhà cung cấp (> 0, tối đa 3 chữ số thập phân)',
  })
  @IsDefined({ message: 'Số lượng xuất là bắt buộc' })
  @Transform(coerceScalarToString)
  @IsString({ message: 'Số lượng xuất không hợp lệ' })
  quantity!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Ghi chú phiếu xuất hủy/trả NCC' })
  @IsOptional()
  @Transform(trimOptionalToNull)
  @IsString({ message: 'Ghi chú không hợp lệ' })
  notes?: string | null;
}
