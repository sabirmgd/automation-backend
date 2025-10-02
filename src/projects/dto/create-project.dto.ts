import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsArray,
  MinLength,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ProjectStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  ON_HOLD = 'on_hold',
}

export class CreateProjectDto {
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsDateString()
  @Type(() => Date)
  startDate?: Date;

  @IsOptional()
  @IsDateString()
  @Type(() => Date)
  endDate?: Date;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  owner?: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  gitlabId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  jiraKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  gitlabUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  jiraUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  localPath?: string;

  @IsOptional()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}