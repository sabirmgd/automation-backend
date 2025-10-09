import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketWorkflow, WorkflowStatus } from './entities/ticket-workflow.entity';
import { VerificationResult } from './entities/verification-result.entity';
import { JiraTicketService } from '../modules/jira/services/jira-ticket.service';
import { HiddenCommentService } from '../modules/jira/services/hidden-comment.service';
import { WorktreeService } from '../git/services/worktree.service';
import { randomUUID } from 'crypto';
import { query } from '@anthropic-ai/claude-agent-sdk';
import {
  StartVerificationResolutionDto,
  ResolutionMode,
  ResolutionStatus,
  VerificationResolutionStatusDto,
} from './dto/verification-resolution.dto';

@Injectable()
export class VerificationResolutionService {
  private readonly logger = new Logger(VerificationResolutionService.name);

  constructor(
    @InjectRepository(TicketWorkflow)
    private readonly workflowRepository: Repository<TicketWorkflow>,
    @InjectRepository(VerificationResult)
    private readonly verificationRepository: Repository<VerificationResult>,
    private readonly jiraTicketService: JiraTicketService,
    private readonly hiddenCommentService: HiddenCommentService,
    private readonly worktreeService: WorktreeService,
  ) {}

  /**
   * Build resolution context from verification report and user guidance
   */
  private async buildResolutionContext(
    ticketId: string,
    verificationId: string,
    mode: 'context' | 'implementation',
    additionalInstructions?: string,
    worktreePath?: string,
    branchName?: string,
  ): Promise<string> {
    // Get ticket details
    const ticket = await this.jiraTicketService.findOne(ticketId);
    if (!ticket) {
      throw new NotFoundException(`Ticket ${ticketId} not found`);
    }

    // Get verification report
    const verification = await this.verificationRepository.findOne({
      where: { id: verificationId },
    });

    if (!verification) {
      throw new NotFoundException(`Verification ${verificationId} not found`);
    }

    // Build resolution prompt
    const missionStatement = mode === 'context'
      ? 'Review the verification issues and provide a detailed plan to fix them. Focus on understanding what needs to be fixed and the approach you would take.'
      : 'Fix all the verification issues according to the report and user guidance. Make the necessary code changes to resolve the problems.';

    return `=== VERIFICATION RESOLUTION TASK ===

Working Directory: ${worktreePath}
Current Branch: ${branchName}

=== ORIGINAL TICKET ===
${ticket.key}: ${ticket.summary}

${ticket.description || 'No description provided'}

=== VERIFICATION REPORT ===
The following issues were found during verification:

${verification.report}

${verification.reviewNotes ? `=== REVIEW NOTES ===
${verification.reviewNotes}

` : ''}

${additionalInstructions ? `=== ADDITIONAL RESOLUTION INSTRUCTIONS ===
${additionalInstructions}

` : ''}

=== YOUR MISSION ===
${missionStatement}

Please ${mode === 'context' ? 'analyze the issues and provide a resolution plan' : 'implement the fixes'} for all the problems identified in the verification report.

Remember to:
1. Address ALL issues mentioned in the verification report
2. Follow any specific guidance from the review notes
3. Ensure your fixes maintain the original ticket requirements
4. ${mode === 'implementation' ? 'Test your changes as you go' : 'Be specific about what changes need to be made'}

Good luck!`;
  }

  /**
   * Start verification resolution session
   */
  async startResolution(
    ticketId: string,
    dto: StartVerificationResolutionDto,
  ): Promise<TicketWorkflow & { resumeCommands: { cd: string; happy: string } }> {
    this.logger.log(`Starting verification resolution for ticket ${ticketId} in ${dto.mode} mode`);

    // Get workflow with relations
    const workflow = await this.workflowRepository.findOne({
      where: { ticketId },
      relations: ['ticket', 'worktree'],
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow for ticket ${ticketId} not found`);
    }

    if (!workflow.worktreeId || !workflow.worktree) {
      throw new BadRequestException('Worktree must exist before starting resolution');
    }

    // Get the verification to resolve (latest if not specified)
    let verificationId = dto.verificationId;

    if (!verificationId) {
      const latestVerification = await this.verificationRepository.findOne({
        where: { ticketWorkflowId: workflow.id },
        order: { createdAt: 'DESC' },
      });

      if (!latestVerification) {
        throw new NotFoundException('No verification found for this workflow');
      }

      verificationId = latestVerification.id;
    }

    // Build resolution context
    const contextMessage = await this.buildResolutionContext(
      ticketId,
      verificationId,
      dto.mode,
      dto.instructions,
      workflow.worktree.worktreePath,
      workflow.generatedBranchName,
    );

    try {
      // Generate session ID
      const sessionId = randomUUID();
      this.logger.log(`Generated resolution session ID: ${sessionId}`);

      // Send context via Claude SDK
      this.logger.log('Sending resolution context via Claude SDK...');

      const queryOptions: any = {
        // Allow all tools for resolution work
        allowedTools: ['Read', 'Write', 'Edit', 'MultiEdit', 'Bash', 'Grep', 'Glob', 'WebSearch', 'WebFetch'],

        // Set working directory to worktree
        cwd: workflow.worktree.worktreePath,

        // Use Claude Opus 4.1 model
        model: 'claude-opus-4-1-20250805',

        maxTurns: 1, // Send context and get acknowledgment

        // Use Claude Code preset
        systemPrompt: {
          type: 'preset' as const,
          preset: 'claude_code' as const,
        },

        // Skip permissions
        permissionMode: 'bypassPermissions' as const,

        // Force session ID
        sessionId: sessionId,
      };

      // Send the context message
      const queryGenerator = query({
        prompt: contextMessage,
        options: queryOptions,
      });

      // Process the response
      let responseText = '';
      for await (const message of queryGenerator) {
        if (message.type === 'assistant' && 'message' in message) {
          const content = message.message.content;
          if (Array.isArray(content)) {
            for (const item of content) {
              if (item.type === 'text') {
                responseText += item.text + '\n';
              }
            }
          }
        }
      }

      this.logger.log('Resolution context sent successfully');
      this.logger.log(`Response preview: ${responseText.substring(0, 200)}...`);

      // Update workflow with resolution session info
      workflow.verificationResolutionSessionId = sessionId;
      workflow.verificationResolutionMetadata = {
        mode: dto.mode,
        startedAt: new Date(),
        status: 'context_sent',
        verificationId,
        resolutionNotes: dto.instructions,
        additionalInstructions: dto.instructions,
        initialResponse: responseText.substring(0, 500),
      };
      workflow.status = WorkflowStatus.VERIFICATION_RESOLUTION_IN_PROGRESS;

      await this.workflowRepository.save(workflow);

      // Prepare resume commands
      const resumeCommands = {
        cd: `cd ${workflow.worktree.worktreePath}`,
        happy: `happy --yolo --continue`,
      };

      this.logger.log('=== RESUME COMMANDS FOR RESOLUTION ===');
      this.logger.log(`1. ${resumeCommands.cd}`);
      this.logger.log(`2. ${resumeCommands.happy}`);
      this.logger.log('=====================================');

      return {
        ...workflow,
        resumeCommands,
      };
    } catch (error: any) {
      this.logger.error(`Failed to start resolution session: ${error.message}`);
      throw new BadRequestException(
        `Failed to start resolution session: ${error.message}`,
      );
    }
  }

  /**
   * Stop verification resolution session
   */
  async stopResolution(ticketId: string): Promise<TicketWorkflow> {
    const workflow = await this.workflowRepository.findOne({
      where: { ticketId },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow for ticket ${ticketId} not found`);
    }

    if (!workflow.verificationResolutionMetadata) {
      throw new BadRequestException('No resolution session found');
    }

    // Update metadata
    workflow.verificationResolutionMetadata = {
      ...workflow.verificationResolutionMetadata,
      status: 'completed',
      completedAt: new Date(),
    };

    await this.workflowRepository.save(workflow);

    this.logger.log(`Resolution session stopped for ticket ${ticketId}`);
    return workflow;
  }

  /**
   * Complete verification resolution
   */
  async completeResolution(ticketId: string, completionNotes?: string): Promise<TicketWorkflow> {
    const workflow = await this.workflowRepository.findOne({
      where: { ticketId },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow for ticket ${ticketId} not found`);
    }

    if (!workflow.verificationResolutionMetadata) {
      throw new BadRequestException('No resolution session found');
    }

    // Update status and metadata
    workflow.status = WorkflowStatus.VERIFICATION_RESOLUTION_COMPLETE;
    workflow.verificationResolutionMetadata = {
      ...workflow.verificationResolutionMetadata,
      status: 'completed',
      completedAt: new Date(),
      resolutionNotes: completionNotes || workflow.verificationResolutionMetadata.resolutionNotes,
    };

    await this.workflowRepository.save(workflow);

    this.logger.log(`Resolution completed for ticket ${ticketId}`);
    return workflow;
  }

  /**
   * Get resolution status
   */
  async getResolutionStatus(ticketId: string): Promise<VerificationResolutionStatusDto> {
    const workflow = await this.workflowRepository.findOne({
      where: { ticketId },
      relations: ['worktree'],
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow for ticket ${ticketId} not found`);
    }

    // Get latest verification
    const latestVerification = await this.verificationRepository.findOne({
      where: { ticketWorkflowId: workflow.id },
      order: { createdAt: 'DESC' },
    });

    const status: ResolutionStatus =
      (workflow.verificationResolutionMetadata?.status as ResolutionStatus) || ResolutionStatus.NOT_STARTED;

    const resumeCommands = workflow.worktree && workflow.verificationResolutionSessionId ? {
      cd: `cd ${workflow.worktree.worktreePath}`,
      happy: `happy --yolo --continue`,
    } : undefined;

    return {
      status,
      sessionId: workflow.verificationResolutionSessionId,
      resumeCommands,
      metadata: workflow.verificationResolutionMetadata,
      verificationId: latestVerification?.id || '',
      worktreePath: workflow.worktree?.worktreePath,
    };
  }

  /**
   * Trigger re-verification after resolution
   */
  async triggerReVerification(ticketId: string): Promise<VerificationResult> {
    const workflow = await this.workflowRepository.findOne({
      where: { ticketId },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow for ticket ${ticketId} not found`);
    }

    if (workflow.status !== WorkflowStatus.VERIFICATION_RESOLUTION_COMPLETE) {
      throw new BadRequestException('Resolution must be completed before re-verification');
    }

    // This would call the verification service
    // For now, just update status
    workflow.status = WorkflowStatus.VERIFYING;
    await this.workflowRepository.save(workflow);

    this.logger.log(`Re-verification triggered for ticket ${ticketId}`);

    // In a real implementation, this would call the verification service
    throw new Error('Re-verification not yet implemented - call work-verification.service.verifyWork()');
  }
}