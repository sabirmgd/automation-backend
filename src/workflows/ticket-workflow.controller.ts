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
} from '@nestjs/common';
import { TicketWorkflowService } from './ticket-workflow.service';
import { GenerateWorkflowBranchNameDto } from './dto/generate-branch-name.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { CreateWorktreeFromWorkflowDto } from './dto/create-worktree-from-workflow.dto';
import { DeleteWorktreeDto } from './dto/delete-worktree.dto';
import { WorkflowStatus } from './entities/ticket-workflow.entity';

@Controller('workflows')
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
}
