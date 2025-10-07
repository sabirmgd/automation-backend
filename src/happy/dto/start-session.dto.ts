import { IsOptional, IsString, IsUUID } from 'class-validator';

export class StartSessionDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  ticketId?: string;

  @IsOptional()
  @IsString()
  workingDirectory?: string;

  @IsOptional()
  @IsString()
  resumeSessionId?: string;
}