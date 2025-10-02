import { IsString, IsUUID, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReviewDto {
  @ApiProperty({ description: 'Pull request ID to review' })
  @IsUUID()
  pullRequestId: string;

  @ApiPropertyOptional({ description: 'Extra instructions for the AI reviewer' })
  @IsOptional()
  @IsString()
  extraInstructions?: string;

  @ApiPropertyOptional({ description: 'Auto-approve generated comments', default: false })
  @IsOptional()
  @IsBoolean()
  autoApprove?: boolean;
}