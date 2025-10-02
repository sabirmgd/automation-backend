import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateDatabaseCredentialDto } from './create-database-credential.dto';
import { IsString, IsOptional } from 'class-validator';

export class UpdateDatabaseCredentialDto extends PartialType(
  OmitType(CreateDatabaseCredentialDto, ['projectId', 'createdBy'] as const),
) {
  @IsString()
  @IsOptional()
  updatedBy?: string;
}