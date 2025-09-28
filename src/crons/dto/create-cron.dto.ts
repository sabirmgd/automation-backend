import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsObject,
  MinLength,
  MaxLength,
} from 'class-validator';

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