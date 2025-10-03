import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { JiraImproverAgentService } from '../../../agents/jira-improver/agent.service';
import { ImproveTicketDto, ImprovedTicketResponseDto, BatchImproveTicketsDto } from '../dto/ticket-improver.dto';
import { ImprovedTicket } from '../../../agents/jira-improver/schemas/ticket.schemas';

@Controller('jira/tickets')
export class TicketImproverController {
  constructor(
    private readonly jiraImproverService: JiraImproverAgentService,
  ) {}

  @Post('improve')
  @HttpCode(HttpStatus.OK)
  async improveTicket(@Body() improveTicketDto: ImproveTicketDto): Promise<ImprovedTicketResponseDto> {
    const improved = await this.jiraImproverService.improveTicket(
      improveTicketDto.description,
      improveTicketDto.context,
    );

    return this.mapToResponseDto(improved);
  }

  @Post('improve-batch')
  @HttpCode(HttpStatus.OK)
  async improveBatchTickets(@Body() batchDto: BatchImproveTicketsDto): Promise<Record<string, ImprovedTicketResponseDto>> {
    const results = await this.jiraImproverService.improveBatchTickets(batchDto.tickets);

    const response: Record<string, ImprovedTicketResponseDto> = {};
    results.forEach((value, key) => {
      response[key] = this.mapToResponseDto(value);
    });

    return response;
  }

  private mapToResponseDto(improved: ImprovedTicket): ImprovedTicketResponseDto {
    return {
      title: improved.title,
      description: improved.description,
      acceptanceCriteria: improved.acceptanceCriteria,
      technicalDetails: improved.technicalDetails,
      scope: improved.scope,
      priority: improved.priority,
      estimatedEffort: improved.estimatedEffort,
      potentialRisks: improved.potentialRisks,
      labels: improved.labels,
    };
  }
}