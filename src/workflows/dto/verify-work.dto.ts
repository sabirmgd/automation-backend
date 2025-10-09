import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class VerifyWorkDto {
  @ApiProperty({
    required: false,
    description: 'Custom verification instructions to add to the default checks',
  })
  @IsOptional()
  @IsString()
  customInstructions?: string;
}

export class AddReviewNotesDto {
  @ApiProperty({
    description: 'Review notes to add to the verification',
  })
  @IsString()
  notes: string;

  @ApiProperty({
    description: 'Name of the reviewer',
  })
  @IsString()
  reviewedBy: string;
}

export class VerificationResultDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  ticketWorkflowId: string;

  @ApiProperty()
  worktreeId: string;

  @ApiProperty()
  report: string;

  @ApiProperty({ required: false })
  reviewNotes?: string;

  @ApiProperty({ required: false })
  reviewedBy?: string;

  @ApiProperty({ required: false })
  reviewedAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}