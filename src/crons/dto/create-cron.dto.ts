import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsObject,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';
import { CronJobType } from '../enums/cron-job-type.enum';

export class CreateCronDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  cronExpression: string;

  @IsEnum(CronJobType)
  @IsOptional()
  jobType?: CronJobType;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsUUID()
  @IsOptional()
  projectId?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}