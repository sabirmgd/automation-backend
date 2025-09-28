import { PartialType } from '@nestjs/mapped-types';
import { CreateGitCredentialDto } from './create-git-credential.dto';

export class UpdateGitCredentialDto extends PartialType(CreateGitCredentialDto) {}