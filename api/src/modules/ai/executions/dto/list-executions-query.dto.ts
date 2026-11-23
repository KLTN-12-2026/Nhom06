import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { trimOptionalToUndefined } from '../../../catalog/dto/catalog-common.dto';
import { PROPOSAL_ACTION_TYPES, ProposalActionType } from '../../proposals/domain/rules';
import { EXECUTION_STATUSES, ExecutionStatus } from '../domain/execution-policy';

export class ListExecutionsQueryDto {
  @ApiPropertyOptional({ enum: EXECUTION_STATUSES, description: 'Lọc theo tiến độ thực hiện' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsIn(EXECUTION_STATUSES, { message: 'Trạng thái thực hiện không hợp lệ' })
  status?: ExecutionStatus;

  @ApiPropertyOptional({ enum: PROPOSAL_ACTION_TYPES, description: 'Lọc theo loại phương án' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsIn(PROPOSAL_ACTION_TYPES, { message: 'Loại phương án không hợp lệ' })
  actionType?: ProposalActionType;
}
