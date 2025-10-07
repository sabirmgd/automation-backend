import { IsString, IsOptional } from 'class-validator';

export class GenerateWorkflowBranchNameDto {
  @IsString()
  ticketId: string;

  @IsString()
  projectId: string;

  @IsOptional()
  options?: {
    includeTicketId?: boolean;
    branchType?: string;
    maxLength?: number;
  };
}
