import { IsString, IsOptional, IsBoolean, IsNumber, Min, Max } from 'class-validator';

export class BranchNameOptionsDto {
  @IsOptional()
  @IsBoolean()
  includeTicketId?: boolean;

  @IsOptional()
  @IsString()
  branchType?: string;

  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(100)
  maxLength?: number;
}

export class GenerateBranchNameDto {
  @IsString()
  projectId: string;

  @IsString()
  ticketId: string;

  @IsOptional()
  options?: BranchNameOptionsDto;
}