import { IsString, IsArray, IsOptional, IsBoolean, IsUUID } from 'class-validator';

export class CreateReleaseDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  fromBranch: string;

  @IsString()
  toBranch: string;

  @IsArray()
  @IsUUID('4', { each: true })
  repositoryIds: string[];

  @IsString()
  @IsOptional()
  prTitleTemplate?: string;

  @IsString()
  @IsOptional()
  prDescriptionTemplate?: string;
}