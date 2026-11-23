import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { trimOptionalToNull, trimOptionalToUndefined } from '../../../catalog/dto/catalog-common.dto';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ApproveProposalDto {
  @ApiPropertyOptional({ nullable: true, description: 'Lưu ý cho người thực hiện phương án' })
  @IsOptional()
  @Transform(trimOptionalToNull)
  @IsString({ message: 'Ý kiến không hợp lệ' })
  note?: string | null;

  @ApiPropertyOptional({
    description: 'ID người phụ trách thực hiện (mặc định là người phê duyệt)',
  })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsUUID('4', { message: 'Mã người phụ trách không đúng định dạng UUID' })
  responsibleUserId?: string;
}

export class RejectProposalDto {
  @ApiProperty({ description: 'Lý do từ chối đề xuất (bắt buộc)' })
  @Transform(trimString)
  @IsString({ message: 'Vui lòng nhập lý do từ chối' })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do từ chối' })
  reason!: string;
}
