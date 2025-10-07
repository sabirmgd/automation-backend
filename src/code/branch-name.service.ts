import { Injectable, NotFoundException } from '@nestjs/common';
import { JiraTicketService } from '../modules/jira/services/jira-ticket.service';
import { PromptsService } from '../prompts/prompts.service';
import { BranchNameGeneratorService } from '../agents/git-agents/branch-name-generator/agent.service';
import { mustPrompts } from '../prompts/must-prompts';
import { BranchGeneratorInput, BranchGeneratorOutput } from '../agents/git-agents/branch-name-generator/schemas/branch.schemas';

export interface BranchNameOptions {
  includeTicketId?: boolean;
  branchType?: string;
  maxLength?: number;
}

@Injectable()
export class BranchNameService {
  constructor(
    private readonly jiraTicketService: JiraTicketService,
    private readonly promptsService: PromptsService,
    private readonly branchGenerator: BranchNameGeneratorService,
  ) {}

  async generateBranchName(
    projectId: string,
    ticketId: string,
    options?: BranchNameOptions,
  ): Promise<BranchGeneratorOutput & { ticketKey: string }> {
    // Get the ticket
    const ticket = await this.getTicketByIdOrKey(ticketId);

    // Try to get BRANCH_RULES prompt for custom rules
    let branchRulesContent: string | null = null;
    try {
      const branchRulesPrompt = await this.promptsService.getPromptByName(
        mustPrompts.BRANCH_RULES,
        projectId,
      );
      branchRulesContent = branchRulesPrompt.content;
      console.log('BRANCH_RULES prompt found for project');
    } catch (error) {
      console.log('BRANCH_RULES prompt not found, using defaults');
    }

    // Build input for branch generator
    const generatorInput: Partial<BranchGeneratorInput> = {
      ticketContent: ticket.description || ticket.summary,
      ticketId: ticket.key,
      context: branchRulesContent || undefined,
      includeTicketId: options?.includeTicketId ?? true,
      maxLength: options?.maxLength || 50,
      branchType: options?.branchType as any,
    };

    console.log(`Generating branch name for ticket ${ticket.key}`);

    try {
      // Generate branch name instantly
      const result = await this.branchGenerator.generateBranchName(generatorInput);

      // Return with ticket key
      return {
        ...result,
        ticketKey: ticket.key,
      };
    } catch (error) {
      console.error('Error generating branch name:', error);

      // Return a simple fallback
      const fallbackBranchName = this.generateFallbackBranch(ticket.key, ticket.summary);
      return {
        branchName: fallbackBranchName,
        alternatives: [],
        type: 'feature',
        confidence: 'low',
        reasoning: 'Generated using fallback due to service error',
        keywords: [],
        gitCompliant: true,
        ticketKey: ticket.key,
      };
    }
  }

  private async getTicketByIdOrKey(ticketId: string) {
    try {
      // Try as UUID first
      return await this.jiraTicketService.findOne(ticketId);
    } catch (error) {
      // If not found as UUID, try as Jira key
      try {
        return await this.jiraTicketService.findByKey(ticketId);
      } catch (keyError) {
        throw new NotFoundException(`Jira ticket with ID or key ${ticketId} not found`);
      }
    }
  }

  private generateFallbackBranch(ticketKey: string, title: string): string {
    // Simple fallback: use ticket key and sanitized title
    const sanitizedTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 30);

    return `${ticketKey.toLowerCase()}/feature/${sanitizedTitle}`;
  }
}