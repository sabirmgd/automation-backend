import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
  IsObject,
  IsUUID,
  IsDateString,
  MaxLength,
  Min,
} from 'class-validator';
import { TaskStatus, TaskPriority } from '../entities/task.entity';

export class CreateTaskDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  assignee?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reporter?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedHours?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsUUID()
  projectId: string;
}