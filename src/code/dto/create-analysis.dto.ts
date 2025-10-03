import { IsString, IsNotEmpty } from 'class-validator';

export class CreateAnalysisDto {
  @IsNotEmpty()
  @IsString()
  projectId: string;

  @IsNotEmpty()
  @IsString()
  ticketId: string;
}