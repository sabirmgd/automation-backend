import { IsBoolean, IsOptional } from 'class-validator';

export class DeleteWorktreeDto {
  @IsOptional()
  @IsBoolean()
  deleteBranch?: boolean;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
