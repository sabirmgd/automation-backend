import { IsString, IsOptional, MaxLength, IsUUID } from 'class-validator';

export class UpdatePromptDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsUUID()
  @IsOptional()
  projectId?: string;
}