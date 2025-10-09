import { IsString, IsOptional, IsUUID, IsArray, IsNumber, IsObject, IsDateString, IsBoolean } from 'class-validator';

export class CreateJiraTicketDto {
  @IsString()
  key: string;

  @IsString()
  summary: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  issueType: string;

  @IsString()
  status: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  resolution?: string;

  @IsUUID()
  boardId: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsUUID()
  reporterId?: string;

  @IsOptional()
  @IsArray()
  labels?: string[];

  @IsOptional()
  @IsArray()
  components?: string[];

  @IsOptional()
  @IsNumber()
  storyPoints?: number;

  @IsOptional()
  @IsNumber()
  originalEstimate?: number;

  @IsOptional()
  @IsNumber()
  remainingEstimate?: number;

  @IsOptional()
  @IsNumber()
  timeSpent?: number;

  @IsOptional()
  @IsString()
  epicKey?: string;

  @IsOptional()
  @IsString()
  parentKey?: string;

  @IsOptional()
  @IsString()
  sprintId?: string;

  @IsOptional()
  @IsString()
  sprintName?: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, any>;

  @IsOptional()
  @IsDateString()
  dueDate?: Date;

  @IsOptional()
  @IsDateString()
  jiraCreatedAt?: Date;

  @IsOptional()
  @IsDateString()
  jiraUpdatedAt?: Date;
}

export class UpdateJiraTicketDto extends CreateJiraTicketDto {}

export class TicketFilterDto {
  @IsOptional()
  @IsUUID()
  boardId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsUUID()
  reporterId?: string;

  @IsOptional()
  @IsString()
  issueType?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsBoolean()
  includeHidden?: boolean;
}