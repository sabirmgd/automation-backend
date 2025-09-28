import { IsOptional, IsUUID, IsEnum, IsArray, IsString, IsDateString } from 'class-validator';
import { TaskStatus, TaskPriority } from '../entities/task.entity';

export class TaskFilterDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsArray()
  @IsEnum(TaskStatus, { each: true })
  statuses?: TaskStatus[];

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsString()
  assignee?: string;

  @IsOptional()
  @IsString()
  reporter?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];

  @IsOptional()
  @IsDateString()
  dueDateBefore?: string;

  @IsOptional()
  @IsDateString()
  dueDateAfter?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sortBy?: 'title' | 'status' | 'priority' | 'createdAt' | 'dueDate';

  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC';
}