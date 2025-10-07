import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { EnvHandling } from '../../git/entities/worktree.entity';

export class CreateWorktreeFromWorkflowDto {
  @IsString()
  ticketId: string;

  @IsString()
  subfolder: string;

  @IsString()
  baseBranch: string;

  @IsOptional()
  @IsEnum(EnvHandling)
  envHandling?: EnvHandling;

  @IsOptional()
  @IsBoolean()
  shareNodeModules?: boolean;
}
