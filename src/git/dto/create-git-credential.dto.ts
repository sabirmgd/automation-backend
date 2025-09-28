import { IsString, IsOptional, IsEnum, IsUrl, IsArray, IsDate, IsBoolean, IsObject } from 'class-validator';
import { CredentialType } from '../entities/git-credential.entity';

export class CreateGitCredentialDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(CredentialType)
  type: CredentialType;

  @IsString()
  provider: string;

  @IsOptional()
  @IsUrl()
  baseUrl?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  privateKey?: string;

  @IsOptional()
  @IsString()
  publicKey?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @IsOptional()
  @IsDate()
  expiresAt?: Date;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: {
    organizationId?: string;
    organizationName?: string;
    apiVersion?: string;
    region?: string;
    customHeaders?: Record<string, string>;
  };

  @IsOptional()
  @IsString()
  projectId?: string;
}