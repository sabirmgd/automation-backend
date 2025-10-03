import { Injectable, Logger } from '@nestjs/common';
import { ChatAnthropic } from '@langchain/anthropic';
import { ConfigService } from '@nestjs/config';
import { ImprovedTicketSchema, ImprovedTicket } from './schemas/ticket.schemas';
import { ticketImproverPrompt } from './prompts/ticket-improver.prompt';

@Injectable()
export class JiraImproverAgentService {
  private readonly logger = new Logger(JiraImproverAgentService.name);
  private model: ChatAnthropic;

  constructor(private readonly configService: ConfigService) {
    this.initializeModel();
  }

  private initializeModel() {
    this.model = new ChatAnthropic({
      apiKey: this.configService.get<string>('COCO_API_KEY'),
      model: 'claude-opus-4-1-20250805',
      temperature: 0.3,
      maxTokens: 10000,
      streaming: true,
    });
  }

  async improveTicket(
    originalDescription: string,
    context?: string,
  ): Promise<ImprovedTicket> {
    this.logger.log('Starting JIRA ticket improvement with Claude Opus');

    // Use structured output with the schema
    const structuredModel = this.model.withStructuredOutput<any>(ImprovedTicketSchema);

    try {
      const currentPrompt = ticketImproverPrompt(originalDescription, context);
      const result = await structuredModel.invoke(currentPrompt) as ImprovedTicket;

      this.logger.log(
        `Ticket improvement completed. Priority: ${result.priority}, ` +
        `Criteria count: ${result.acceptanceCriteria?.length || 0}`,
      );

      return result;
    } catch (error) {
      this.logger.error('Error improving JIRA ticket:', error);

      // Return a basic fallback response
      return {
        title: 'Ticket Needs Improvement',
        description: originalDescription || 'Original description was empty',
        acceptanceCriteria: [
          {
            criteria: 'Original ticket needs more detail',
            testable: false,
          },
        ],
        scope: 'To be defined',
        priority: 'medium',
        technicalDetails: `Error during improvement: ${error.message}`,
      } as ImprovedTicket;
    }
  }

  async improveBatchTickets(
    tickets: Array<{
      id: string;
      description: string;
      context?: string;
    }>,
  ): Promise<Map<string, ImprovedTicket>> {
    this.logger.log(`Starting batch ticket improvement for ${tickets.length} tickets`);
    const results = new Map<string, ImprovedTicket>();

    for (const ticket of tickets) {
      try {
        const improvedTicket = await this.improveTicket(
          ticket.description,
          ticket.context,
        );
        results.set(ticket.id, improvedTicket);
      } catch (error) {
        this.logger.error(`Failed to improve ticket ${ticket.id}`, error);
        // Create a minimal error response
        results.set(ticket.id, {
          title: 'Improvement Failed',
          description: ticket.description,
          acceptanceCriteria: [],
          scope: 'Error occurred during improvement',
          priority: 'low',
        } as ImprovedTicket);
      }
    }

    return results;
  }
}