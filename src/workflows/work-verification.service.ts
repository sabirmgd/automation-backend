import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VerificationResult } from './entities/verification-result.entity';
import { TicketWorkflow, WorkflowStatus } from './entities/ticket-workflow.entity';
import { VerificationAgentService } from '../agents/verification/agent.service';
import { JiraTicketService } from '../modules/jira/services/jira-ticket.service';
import { HiddenCommentService } from '../modules/jira/services/hidden-comment.service';
import { WorktreeService } from '../git/services/worktree.service';

@Injectable()
export class WorkVerificationService {
  private readonly logger = new Logger(WorkVerificationService.name);

  constructor(
    @InjectRepository(VerificationResult)
    private readonly verificationRepository: Repository<VerificationResult>,
    @InjectRepository(TicketWorkflow)
    private readonly workflowRepository: Repository<TicketWorkflow>,
    private readonly verificationAgent: VerificationAgentService,
    private readonly jiraTicketService: JiraTicketService,
    private readonly hiddenCommentService: HiddenCommentService,
    private readonly worktreeService: WorktreeService,
  ) {}

  async verifyWork(
    ticketId: string,
    customInstructions?: string,
  ): Promise<VerificationResult> {
    this.logger.log(`Starting verification for ticket ${ticketId}`);

    // Get workflow
    const workflow = await this.workflowRepository.findOne({
      where: { ticketId },
      relations: ['worktree'],
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow not found for ticket ${ticketId}`);
    }

    if (!workflow.worktreeId) {
      throw new Error(`No worktree found for ticket ${ticketId}`);
    }

    // Update workflow status
    workflow.status = WorkflowStatus.VERIFYING;
    await this.workflowRepository.save(workflow);

    try {
      // Get ticket details
      const ticket = await this.jiraTicketService.findOne(ticketId);
      if (!ticket) {
        throw new NotFoundException(`Ticket ${ticketId} not found`);
      }

      // Get preliminary analysis from hidden comments (latest AI comment with sessionId)
      const analysisComments = await this.hiddenCommentService.findAll(ticketId);
      const preliminaryAnalysis = analysisComments
        .filter(comment => comment.authorType === 'ai' && comment.sessionId)
        .map(comment => comment.content)
        .join('\n\n');

      // Get worktree path
      const worktree = await this.worktreeService.findOne(workflow.worktreeId);
      if (!worktree) {
        throw new NotFoundException(`Worktree ${workflow.worktreeId} not found`);
      }

      // Run verification
      const report = await this.verificationAgent.verifyWork({
        worktreePath: worktree.worktreePath,
        ticketKey: ticket.key,
        ticketDescription: `${ticket.summary}\n\n${ticket.description || ''}`,
        preliminaryAnalysis: preliminaryAnalysis || 'No preliminary analysis found.',
        customInstructions,
      });

      // Save verification result
      const verificationResult = this.verificationRepository.create({
        ticketWorkflowId: workflow.id,
        worktreeId: workflow.worktreeId,
        report,
      });

      const savedResult = await this.verificationRepository.save(verificationResult);

      // Update workflow status
      workflow.status = WorkflowStatus.VERIFICATION_COMPLETE;
      await this.workflowRepository.save(workflow);

      this.logger.log(`Verification completed for ticket ${ticketId}`);
      return savedResult;

    } catch (error) {
      this.logger.error(`Verification failed for ticket ${ticketId}`, error);

      // Update workflow status to error
      workflow.status = WorkflowStatus.ERROR;
      workflow.metadata = {
        ...workflow.metadata,
        verificationError: `Verification failed: ${error.message}`,
        verificationErrorAt: new Date(),
      };
      await this.workflowRepository.save(workflow);

      throw error;
    }
  }

  async getLatestVerification(ticketId: string): Promise<VerificationResult | null> {
    const workflow = await this.workflowRepository.findOne({
      where: { ticketId },
    });

    if (!workflow) {
      return null;
    }

    return this.verificationRepository.findOne({
      where: { ticketWorkflowId: workflow.id },
      order: { createdAt: 'DESC' },
    });
  }

  async addReviewNotes(
    verificationId: string,
    notes: string,
    reviewedBy: string,
  ): Promise<VerificationResult> {
    const verification = await this.verificationRepository.findOne({
      where: { id: verificationId },
    });

    if (!verification) {
      throw new NotFoundException(`Verification ${verificationId} not found`);
    }

    verification.reviewNotes = notes;
    verification.reviewedBy = reviewedBy;
    verification.reviewedAt = new Date();

    return this.verificationRepository.save(verification);
  }

  async approveForPR(ticketId: string): Promise<void> {
    const workflow = await this.workflowRepository.findOne({
      where: { ticketId },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow not found for ticket ${ticketId}`);
    }

    workflow.status = WorkflowStatus.READY_FOR_PR;
    await this.workflowRepository.save(workflow);

    this.logger.log(`Ticket ${ticketId} approved for PR creation`);
  }
}