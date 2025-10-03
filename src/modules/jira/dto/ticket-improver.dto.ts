import { IsString, IsOptional } from 'class-validator';

export class ImproveTicketDto {
  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  context?: string;
}

import { AcceptanceCriteria, Priority } from '../../../agents/jira-improver/schemas/ticket.schemas';

export class ImprovedTicketResponseDto {
  title: string;
  description: string;
  acceptanceCriteria: AcceptanceCriteria[];
  technicalDetails?: string;
  scope: string;
  priority: Priority;
  estimatedEffort?: 'small' | 'medium' | 'large' | 'extra-large';
  potentialRisks?: string[];
  labels?: string[];
}

export class BatchImproveTicketsDto {
  tickets: Array<{
    id: string;
    description: string;
    context?: string;
  }>;
}