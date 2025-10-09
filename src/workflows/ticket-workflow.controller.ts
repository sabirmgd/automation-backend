import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { TicketWorkflowService } from './ticket-workflow.service';
import { GenerateWorkflowBranchNameDto } from './dto/generate-branch-name.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { CreateWorktreeFromWorkflowDto } from './dto/create-worktree-from-workflow.dto';
import { DeleteWorktreeDto } from './dto/delete-worktree.dto';
import { VerifyWorkDto, AddReviewNotesDto } from './dto/verify-work.dto';
import { StartVerificationResolutionDto, CompleteVerificationResolutionDto } from './dto/verification-resolution.dto';
import { RunIntegrationTestDto, MarkTestsNeedFixDto } from './dto/integration-test.dto';
import { WorkflowStatus } from './entities/ticket-workflow.entity';

@Controller('api/workflows')
export class TicketWorkflowController {
  constructor(
    private readonly workflowService: TicketWorkflowService,
  ) {}

  /**
   * Get or create workflow for a ticket
   */
  @Post('init')
  @HttpCode(HttpStatus.OK)
  async initWorkflow(
    @Body() body: { ticketId: string; projectId: string },
  ) {
    return this.workflowService.getOrCreateWorkflow(
      body.ticketId,
      body.projectId,
    );
  }

  /**
   * Generate branch name for a ticket
   */
  @Post('branch-name')
  async generateBranchName(@Body() dto: GenerateWorkflowBranchNameDto) {
    return this.workflowService.generateBranchName(
      dto.ticketId,
      dto.projectId,
      dto.options,
    );
  }

  /**
   * Create worktree from generated branch name
   */
  @Post('worktree')
  async createWorktree(@Body() dto: CreateWorktreeFromWorkflowDto) {
    return this.workflowService.createWorktreeFromBranchName(dto);
  }

  /**
   * Delete worktree for a ticket
   */
  @Delete('ticket/:ticketId/worktree')
  @HttpCode(HttpStatus.OK)
  async deleteWorktree(
    @Param('ticketId') ticketId: string,
    @Body() dto: DeleteWorktreeDto,
  ) {
    return this.workflowService.deleteWorktree(ticketId, dto);
  }

  /**
   * Get workflow by ticket ID
   */
  @Get('ticket/:ticketId')
  async getByTicketId(@Param('ticketId') ticketId: string) {
    return this.workflowService.getByTicketId(ticketId);
  }

  /**
   * Get workflow by ID
   */
  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.workflowService.getById(id);
  }

  /**
   * Get all workflows with optional filters
   */
  @Get()
  async findAll(
    @Query('skip') skip?: number,
    @Query('take') take?: number,
    @Query('status') status?: WorkflowStatus,
  ) {
    return this.workflowService.findAll({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      status,
    });
  }

  /**
   * Update workflow
   */
  @Patch('ticket/:ticketId')
  async updateWorkflow(
    @Param('ticketId') ticketId: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflowService.updateWorkflow(ticketId, dto);
  }

  /**
   * Delete workflow
   */
  @Delete('ticket/:ticketId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWorkflow(@Param('ticketId') ticketId: string) {
    await this.workflowService.deleteWorkflow(ticketId);
  }

  /**
   * Start Happy session for a ticket
   */
  @Post('ticket/:ticketId/happy/start')
  async startHappySession(
    @Param('ticketId') ticketId: string,
    @Body() dto: {
      mode: 'implementation' | 'context';
      additionalInstructions?: string;
    },
  ) {
    return this.workflowService.startHappySession(
      ticketId,
      dto.mode,
      dto.additionalInstructions,
    );
  }

  /**
   * Stop Happy session for a ticket
   */
  @Post('ticket/:ticketId/happy/stop')
  async stopHappySession(@Param('ticketId') ticketId: string) {
    return this.workflowService.stopHappySession(ticketId);
  }

  /**
   * Get Happy session status for a ticket
   */
  @Get('ticket/:ticketId/happy/status')
  async getHappySessionStatus(@Param('ticketId') ticketId: string) {
    return this.workflowService.getHappySessionStatus(ticketId);
  }

  /**
   * Verify work done for a ticket
   */
  @Post('ticket/:ticketId/verify')
  async verifyWork(
    @Param('ticketId') ticketId: string,
    @Body() dto: VerifyWorkDto,
  ) {
    return this.workflowService.verifyWork(ticketId, dto.customInstructions);
  }

  /**
   * Get latest verification result for a ticket
   */
  @Get('ticket/:ticketId/verification')
  async getLatestVerification(@Param('ticketId') ticketId: string) {
    const verification = await this.workflowService.getLatestVerification(ticketId);
    if (!verification) {
      throw new NotFoundException('No verification found for this ticket');
    }
    return verification;
  }

  /**
   * Add review notes to a verification
   */
  @Post('verification/:id/notes')
  async addVerificationReviewNotes(
    @Param('id') verificationId: string,
    @Body() dto: AddReviewNotesDto,
  ) {
    return this.workflowService.addVerificationReviewNotes(
      verificationId,
      dto.notes,
      dto.reviewedBy,
    );
  }

  /**
   * Approve ticket for PR creation after verification
   */
  @Post('ticket/:ticketId/approve-for-pr')
  @HttpCode(HttpStatus.NO_CONTENT)
  async approveForPR(@Param('ticketId') ticketId: string) {
    await this.workflowService.approveForPR(ticketId);
  }

  /**
   * Start verification resolution session
   */
  @Post('ticket/:ticketId/verification/resolve')
  async startVerificationResolution(
    @Param('ticketId') ticketId: string,
    @Body() dto: StartVerificationResolutionDto,
  ) {
    return this.workflowService.startVerificationResolution(ticketId, dto);
  }

  /**
   * Stop verification resolution session
   */
  @Post('ticket/:ticketId/verification/resolve/stop')
  @HttpCode(HttpStatus.OK)
  async stopVerificationResolution(@Param('ticketId') ticketId: string) {
    return this.workflowService.stopVerificationResolution(ticketId);
  }

  /**
   * Complete verification resolution
   */
  @Post('ticket/:ticketId/verification/resolve/complete')
  async completeVerificationResolution(
    @Param('ticketId') ticketId: string,
    @Body() dto: CompleteVerificationResolutionDto,
  ) {
    return this.workflowService.completeVerificationResolution(
      ticketId,
      dto.completionNotes,
    );
  }

  /**
   * Get verification resolution status
   */
  @Get('ticket/:ticketId/verification/resolve/status')
  async getVerificationResolutionStatus(@Param('ticketId') ticketId: string) {
    return this.workflowService.getVerificationResolutionStatus(ticketId);
  }

  /**
   * Trigger re-verification after resolution
   */
  @Post('ticket/:ticketId/verification/re-verify')
  async triggerReVerification(@Param('ticketId') ticketId: string) {
    return this.workflowService.triggerReVerification(ticketId);
  }

  /**
   * Run integration tests for a ticket
   */
  @Post('ticket/:ticketId/integration-test')
  async runIntegrationTest(
    @Param('ticketId') ticketId: string,
    @Body() dto: RunIntegrationTestDto,
  ) {
    return this.workflowService.runIntegrationTest(ticketId, dto.customInstructions);
  }

  /**
   * Get latest integration test results for a ticket
   */
  @Get('ticket/:ticketId/integration-test/latest')
  async getLatestTestResults(@Param('ticketId') ticketId: string) {
    const results = await this.workflowService.getLatestTestResults(ticketId);
    if (!results) {
      throw new NotFoundException('No test results found for this ticket');
    }
    return results;
  }

  /**
   * Get integration test history for a ticket
   */
  @Get('ticket/:ticketId/integration-test/history')
  async getTestHistory(
    @Param('ticketId') ticketId: string,
    @Query('limit') limit?: number,
  ) {
    return this.workflowService.getTestHistory(ticketId, limit ? Number(limit) : 10);
  }

  /**
   * Mark tests as needing fixes
   */
  @Post('ticket/:ticketId/integration-test/mark-needs-fix')
  async markTestsNeedFix(
    @Param('ticketId') ticketId: string,
    @Body() dto: MarkTestsNeedFixDto,
  ) {
    return this.workflowService.markTestsNeedFix(ticketId, dto.issues);
  }

  /**
   * Approve integration tests
   */
  @Post('ticket/:ticketId/integration-test/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  async approveIntegrationTests(@Param('ticketId') ticketId: string) {
    await this.workflowService.approveIntegrationTests(ticketId);
  }
}
