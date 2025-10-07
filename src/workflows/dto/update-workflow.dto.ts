import { IsString, IsOptional, IsEnum } from 'class-validator';
import { WorkflowStatus, AnalysisStatus } from '../entities/ticket-workflow.entity';

export class UpdateWorkflowDto {
  @IsOptional()
  @IsEnum(AnalysisStatus)
  analysisStatus?: AnalysisStatus;

  @IsOptional()
  @IsString()
  analysisSessionId?: string;

  @IsOptional()
  @IsString()
  generatedBranchName?: string;

  @IsOptional()
  branchNameMetadata?: {
    type?: string;
    confidence?: string;
    reasoning?: string;
    alternatives?: string[];
    generatedAt?: Date;
  };

  @IsOptional()
  @IsString()
  worktreeId?: string;

  @IsOptional()
  @IsString()
  happySessionId?: string;

  @IsOptional()
  @IsString()
  pullRequestId?: string;

  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;

  @IsOptional()
  metadata?: Record<string, any>;
}
