import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsObject,
  Min,
  Max,
  Length,
} from 'class-validator';
import { DatabaseType, Environment } from '../entities/database-credential.entity';

export class CreateDatabaseCredentialDto {
  @IsString()
  @Length(1, 255)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(Environment)
  environment: Environment;

  @IsEnum(DatabaseType)
  dbType: DatabaseType;

  @IsString()
  @Length(1, 255)
  host: string;

  @IsNumber()
  @Min(1)
  @Max(65535)
  port: number;

  @IsString()
  @Length(1, 255)
  database: string;

  @IsString()
  @Length(1, 255)
  username: string;

  @IsString()
  password: string;

  @IsObject()
  @IsOptional()
  sslConfig?: {
    enabled?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
    rejectUnauthorized?: boolean;
  };

  @IsObject()
  @IsOptional()
  connectionOptions?: {
    connectionTimeout?: number;
    requestTimeout?: number;
    pool?: {
      min?: number;
      max?: number;
      idleTimeoutMillis?: number;
    };
    charset?: string;
    timezone?: string;
    [key: string]: any;
  };

  @IsObject()
  @IsOptional()
  metadata?: {
    region?: string;
    cluster?: string;
    replicaSet?: string;
    authSource?: string;
    tags?: string[];
    [key: string]: any;
  };

  @IsUUID()
  projectId: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  createdBy?: string;
}