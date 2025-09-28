import { PartialType } from '@nestjs/mapped-types';
import { CreateGitRepositoryDto } from './create-git-repository.dto';
import { IsOptional, IsBoolean } from 'class-validator';

export class UpdateGitRepositoryDto extends PartialType(CreateGitRepositoryDto) {
  @IsOptional()
  @IsBoolean()
  isHot?: boolean;
}