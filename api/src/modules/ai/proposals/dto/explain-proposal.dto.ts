import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class ExplainProposalDto {
  @ApiPropertyOptional({
    description: 'Giả lập dịch vụ LLM không phản hồi (chỉ cho phép khi LLM_DEMO_TOGGLE=true)',
  })
  @IsOptional()
  @IsBoolean({ message: 'Giá trị simulateFailure phải là boolean' })
  simulateFailure?: boolean;
}
