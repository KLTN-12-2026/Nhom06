import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import { trimOptionalToUndefined } from '../../catalog/dto/catalog-common.dto';
import { RISK_LEVEL_VALUES, type RiskLevel } from '../domain/risk-report.domain';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const PROPOSAL_STATUS_VALUES = [
  'new',
  'pending',
  'approved',
  'rejected',
  'in_progress',
  'completed',
  'expired',
  'cancelled',
] as const;

export const EXECUTION_STATUS_VALUES = [
  'planned',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
] as const;

export class RiskReportQueryDto {
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày bắt đầu phải đúng định dạng YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @Matches(ISO_DATE_PATTERN, { message: 'Ngày kết thúc phải đúng định dạng YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsUUID('4', { message: 'Mã sản phẩm không hợp lệ' })
  productId?: string;

  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsIn(RISK_LEVEL_VALUES, { message: 'Mức rủi ro không hợp lệ' })
  riskLevel?: RiskLevel;

  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsIn(PROPOSAL_STATUS_VALUES, { message: 'Trạng thái đề xuất không hợp lệ' })
  proposalStatus?: (typeof PROPOSAL_STATUS_VALUES)[number];

  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsIn(EXECUTION_STATUS_VALUES, { message: 'Trạng thái thực hiện không hợp lệ' })
  executionStatus?: (typeof EXECUTION_STATUS_VALUES)[number];
}
