import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsObject,
  Min,
  Max,
  Length,
} from 'class-validator';
import { DatabaseType } from '../entities/database-credential.entity';

export class TestConnectionDto {
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
    [key: string]: any;
  };
}