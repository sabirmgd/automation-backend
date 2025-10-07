import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HiddenComment, AuthorType } from '../modules/jira/entities/hidden-comment.entity';
import { JiraTicket } from '../modules/jira/entities/jira-ticket.entity';

export interface HappyContextOptions {
  mode: 'implementation' | 'context';
  additionalInstructions?: string;
  worktreePath?: string;
  branchName?: string;
}

@Injectable()
export class HappyContextBuilder {
  private readonly logger = new Logger(HappyContextBuilder.name);

  constructor(
    @InjectRepository(HiddenComment)
    private readonly hiddenCommentRepository: Repository<HiddenComment>,
    @InjectRepository(JiraTicket)
    private readonly jiraTicketRepository: Repository<JiraTicket>,
  ) {}

  async buildContext(
    ticketId: string,
    options: HappyContextOptions,
  ): Promise<string> {
    this.logger.log(`Building Happy context for ticket ${ticketId} in ${options.mode} mode`);

    // Fetch ticket details
    const ticket = await this.jiraTicketRepository.findOne({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    // Get latest AI comment from HiddenComments
    const latestAIComment = await this.hiddenCommentRepository.findOne({
      where: {
        ticketId,
        authorType: AuthorType.AI,
      },
      order: { createdAt: 'DESC' },
    });

    if (!latestAIComment) {
      throw new Error(`No AI analysis found for ticket ${ticketId}`);
    }

    // Extract session content from the AI comment
    const analysisContent = this.extractAnalysisContent(latestAIComment.content);

    // Build context based on mode
    if (options.mode === 'implementation') {
      return this.buildImplementationContext(
        ticket,
        analysisContent,
        options,
      );
    } else {
      return this.buildContextModeContext(
        ticket,
        analysisContent,
        options,
      );
    }
  }

  private extractAnalysisContent(content: string): string {
    // Remove session metadata markers if present
    const lines = content.split('\n');
    const filteredLines = lines.filter(line =>
      !line.startsWith('[SESSION_ID:') &&
      !line.startsWith('[RESUMING_SESSION:')
    );
    return filteredLines.join('\n').trim();
  }

  private buildImplementationContext(
    ticket: JiraTicket,
    analysis: string,
    options: HappyContextOptions,
  ): string {
    const { worktreePath, branchName, additionalInstructions } = options;

    let context = `# Ticket: ${ticket.key} - ${ticket.summary}\n\n`;

    context += `## Ticket Description\n`;
    context += `${ticket.description || 'No description provided'}\n\n`;

    context += `## Analysis\n`;
    context += `${analysis}\n\n`;

    if (worktreePath && branchName) {
      context += `## Working Directory\n`;
      context += `Path: ${worktreePath}\n`;
      context += `Branch: ${branchName}\n\n`;
    }

    context += `## Your Mission\n`;
    context += `Based on the analysis above, please implement the solution immediately. `;
    context += `The worktree is ready and you should start coding now.\n\n`;
    context += `Start implementing the solution without additional planning.\n`;

    if (additionalInstructions) {
      context += `\n## Additional Instructions\n`;
      context += `${additionalInstructions}\n`;
    }

    return context;
  }

  private buildContextModeContext(
    ticket: JiraTicket,
    analysis: string,
    options: HappyContextOptions,
  ): string {
    const { worktreePath, branchName, additionalInstructions } = options;

    let context = `# Ticket: ${ticket.key} - ${ticket.summary}\n\n`;

    context += `## Ticket Description\n`;
    context += `${ticket.description || 'No description provided'}\n\n`;

    context += `## Analysis\n`;
    context += `${analysis}\n\n`;

    if (worktreePath && branchName) {
      context += `## Working Directory\n`;
      context += `You're in: ${worktreePath}\n`;
      context += `On branch: ${branchName}\n\n`;
    }

    context += `## Instructions\n`;
    context += `I've loaded the ticket context and analysis for you. `;
    context += `Please review the information above and wait for my specific instructions before making any changes.\n`;

    if (additionalInstructions) {
      context += `\n## Additional Context\n`;
      context += `${additionalInstructions}\n`;
    }

    return context;
  }
}