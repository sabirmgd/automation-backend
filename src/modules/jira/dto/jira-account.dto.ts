import { IsString, IsUrl, IsEmail, IsOptional, IsBoolean, IsUUID } from 'class-validator';

export class CreateJiraAccountDto {
  @IsString()
  accountName: string;

  @IsUrl()
  jiraUrl: string;

  @IsEmail()
  email: string;

  @IsString()
  apiToken: string;

  @IsOptional()
  @IsString()
  accountType?: string;

  @IsOptional()
  @IsString()
  cloudId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  projectId?: string;
}

export class UpdateJiraAccountDto {
  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsUrl()
  jiraUrl?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  apiToken?: string;

  @IsOptional()
  @IsString()
  accountType?: string;

  @IsOptional()
  @IsString()
  cloudId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  projectId?: string;
}