import { IsUUID, IsEnum, IsString, IsOptional, IsUrl, IsBoolean, IsObject } from 'class-validator';
import { GitProvider, RepositoryVisibility } from '../entities/git-repository.entity';

export class CreateGitRepositoryDto {
  @IsUUID()
  projectId: string;

  @IsEnum(GitProvider)
  provider: GitProvider;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  url?: string;

  @IsOptional()
  @IsUrl()
  cloneUrl?: string;

  @IsOptional()
  @IsString()
  sshUrl?: string;

  @IsOptional()
  @IsString()
  defaultBranch?: string;

  @IsOptional()
  @IsString()
  remoteId?: string;

  @IsOptional()
  @IsString()
  namespace?: string;

  @IsOptional()
  @IsEnum(RepositoryVisibility)
  visibility?: RepositoryVisibility;

  @IsOptional()
  @IsUUID()
  credentialId?: string;

  @IsOptional()
  @IsString()
  localPath?: string;

  @IsOptional()
  @IsBoolean()
  isForked?: boolean;

  @IsOptional()
  @IsString()
  parentUrl?: string;

  @IsOptional()
  @IsObject()
  metadata?: {
    stars?: number;
    forks?: number;
    watchers?: number;
    openIssues?: number;
    language?: string;
    topics?: string[];
    lastCommitAt?: Date;
    size?: number;
  };
}