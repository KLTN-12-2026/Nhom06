import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import {
  PROPOSAL_ACTION_TYPES,
  PROPOSAL_STATUSES,
  ProposalActionType,
  ProposalStatus,
} from '../domain/rules';
import { RiskLevel } from '../../risk/domain/lot-risk.domain';

const RISK_LEVEL_FILTER_VALUES: readonly RiskLevel[] = ['critical', 'high', 'medium', 'low'];

export class ListProposalsQueryDto {
  @ApiPropertyOptional({ enum: PROPOSAL_STATUSES })
  @IsOptional()
  @IsIn(PROPOSAL_STATUSES, {
    message: 'Trạng thái đề xuất không hợp lệ',
  })
  status?: ProposalStatus;

  @ApiPropertyOptional({ enum: RISK_LEVEL_FILTER_VALUES })
  @IsOptional()
  @IsIn(RISK_LEVEL_FILTER_VALUES, {
    message: 'Mức rủi ro không hợp lệ',
  })
  riskLevel?: RiskLevel;

  @ApiPropertyOptional({ enum: PROPOSAL_ACTION_TYPES })
  @IsOptional()
  @IsIn(PROPOSAL_ACTION_TYPES, {
    message: 'Phương án xử lý không hợp lệ',
  })
  actionType?: ProposalActionType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'Mã lô không đúng định dạng UUID' })
  lotId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'Mã sản phẩm không đúng định dạng UUID' })
  productId?: string;
}
