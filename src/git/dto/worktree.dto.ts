import { IsString, IsOptional, IsBoolean, IsEnum, IsUUID } from 'class-validator';
import { EnvHandling, WorktreeStatus } from '../entities/worktree.entity';

export class CreateWorktreeDto {
  // Mode 1: Use existing GitRepository
  @IsOptional()
  @IsUUID()
  repositoryId?: string;

  // Mode 2: Use Project + subfolder (calculates git repo path)
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsString()
  subfolder?: string;

  @IsString()
  branchName: string;

  @IsOptional()
  @IsString()
  baseBranch?: string;

  @IsOptional()
  @IsUUID()
  ticketId?: string;

  @IsOptional()
  @IsBoolean()
  isNewBranch?: boolean;

  @IsOptional()
  @IsEnum(EnvHandling)
  envHandling?: EnvHandling;

  @IsOptional()
  @IsBoolean()
  shareNodeModules?: boolean;

  @IsOptional()
  @IsBoolean()
  autoSwitch?: boolean;
}

export class UpdateWorktreeDto {
  @IsOptional()
  @IsEnum(WorktreeStatus)
  status?: WorktreeStatus;

  @IsOptional()
  @IsUUID()
  ticketId?: string;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class WorktreeListFiltersDto {
  @IsOptional()
  @IsUUID()
  repositoryId?: string;

  @IsOptional()
  @IsUUID()
  ticketId?: string;

  @IsOptional()
  @IsEnum(WorktreeStatus)
  status?: WorktreeStatus;

  @IsOptional()
  @IsString()
  branchName?: string;
}

export class RemoveWorktreeDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @IsOptional()
  @IsBoolean()
  deleteBranch?: boolean;
}

export class WorktreeResponseDto {
  id: string;
  repositoryId: string;
  repositoryName?: string;
  ticketId?: string;
  ticketKey?: string;
  branchName: string;
  worktreePath: string;
  baseBranch: string;
  status: WorktreeStatus;
  envHandling: EnvHandling;
  nodeModulesShared: boolean;
  isNewBranch: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export class WorktreeStatsDto {
  total: number;
  active: number;
  deleted: number;
  stale: number;
  totalDiskUsage?: number; // in bytes
  byRepository: {
    repositoryId: string;
    repositoryName: string;
    count: number;
  }[];
  byTicket: {
    ticketId: string;
    ticketKey: string;
    count: number;
  }[];
}

export class CleanupWorktreesDto {
  @IsOptional()
  @IsBoolean()
  pruneStale?: boolean;

  @IsOptional()
  @IsBoolean()
  removeOrphaned?: boolean;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class CleanupResultDto {
  pruned: number;
  orphanedRemoved: number;
  errors: string[];
  freedDiskSpace?: number; // in bytes
}
