import {
  IsEnum,
  IsString,
  IsOptional,
  IsUrl,
  IsObject,
  MaxLength,
} from 'class-validator';
import { TaskLinkType } from '../entities/task-link.entity';

export class LinkTaskDto {
  @IsEnum(TaskLinkType)
  linkType: TaskLinkType;

  @IsString()
  @MaxLength(255)
  externalId: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  externalUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  platform?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UnlinkTaskDto {
  @IsEnum(TaskLinkType)
  linkType: TaskLinkType;

  @IsString()
  externalId: string;
}