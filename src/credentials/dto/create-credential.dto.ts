import { IsString, IsOptional, IsBoolean, IsDate, IsObject } from 'class-validator';

export class CreateCredentialDto {
  @IsString()
  name: string;

  @IsString()
  service: string; // github, gitlab, jira, aws, etc.

  @IsString()
  type: string; // ssh_key, pat, api_key, oauth, basic_auth, etc.

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  secret: string; // Generic field for token, password, private key, etc.

  @IsOptional()
  @IsObject()
  metadata?: {
    username?: string;
    endpoint?: string;
    region?: string;
    database?: string;
    port?: number;
    permissions?: string[];
    scope?: string;
    [key: string]: any;
  };

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsDate()
  expiresAt?: Date;
}