import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketWorkflow, WorkflowStatus, AnalysisStatus } from './entities/ticket-workflow.entity';
import { BranchNameService } from '../code/branch-name.service';
import { JiraTicketService } from '../modules/jira/services/jira-ticket.service';
import { WorktreeService } from '../git/services/worktree.service';
import { ProjectsService } from '../projects/projects.service';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { CreateWorktreeFromWorkflowDto } from './dto/create-worktree-from-workflow.dto';
import { EnvHandling } from '../git/entities/worktree.entity';
import { WorktreeResponseDto } from '../git/dto/worktree.dto';
import { GitRepository, GitProvider } from '../git/entities/git-repository.entity';
import { HappyContextBuilder } from '../code/happy-context.builder';
import { WorkVerificationService } from './work-verification.service';
import { VerificationResult } from './entities/verification-result.entity';
import { VerificationResolutionService } from './verification-resolution.service';
import { StartVerificationResolutionDto, VerificationResolutionStatusDto } from './dto/verification-resolution.dto';
import { IntegrationTestingService } from './integration-testing.service';
import { IntegrationTestResult } from './entities/integration-test-result.entity';
import * as path from 'path';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { query } from '@anthropic-ai/claude-agent-sdk';

@Injectable()
export class TicketWorkflowService {
  private readonly logger = new Logger(TicketWorkflowService.name);

  constructor(
    @InjectRepository(TicketWorkflow)
    private readonly workflowRepository: Repository<TicketWorkflow>,
    private readonly branchNameService: BranchNameService,
    private readonly jiraTicketService: JiraTicketService,
    private readonly worktreeService: WorktreeService,
    private readonly projectsService: ProjectsService,
    private readonly verificationService: WorkVerificationService,
    private readonly happyContextBuilder: HappyContextBuilder,
    private readonly verificationResolutionService: VerificationResolutionService,
    private readonly integrationTestingService: IntegrationTestingService,
  ) {}

  /**
   * Get or create workflow for a ticket
   */
  async getOrCreateWorkflow(
    ticketId: string,
    projectId: string,
  ): Promise<TicketWorkflow> {
    // Verify ticket exists
    const ticket = await this.jiraTicketService.findOne(ticketId);
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
    }

    // Try to find existing workflow
    let workflow = await this.workflowRepository.findOne({
      where: { ticketId },
      relations: ['ticket', 'project', 'worktree'],
    });

    // Create new if doesn't exist
    if (!workflow) {
      workflow = this.workflowRepository.create({
        ticketId,
        projectId,
        status: WorkflowStatus.NOT_STARTED,
        analysisStatus: AnalysisStatus.NONE,
      });
      await this.workflowRepository.save(workflow);
      this.logger.log(`Created new workflow for ticket ${ticketId}`);
    }

    return workflow;
  }

  /**
   * Get workflow by ticket ID
   */
  async getByTicketId(ticketId: string): Promise<TicketWorkflow | null> {
    return this.workflowRepository.findOne({
      where: { ticketId },
      relations: ['ticket', 'project', 'worktree'],
    });
  }

  /**
   * Get workflow by ID
   */
  async getById(id: string): Promise<TicketWorkflow> {
    const workflow = await this.workflowRepository.findOne({
      where: { id },
      relations: ['ticket', 'project', 'worktree'],
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow with ID ${id} not found`);
    }

    return workflow;
  }

  /**
   * Generate and save branch name for a workflow
   */
  async generateBranchName(
    ticketId: string,
    projectId: string,
    options?: {
      includeTicketId?: boolean;
      branchType?: string;
      maxLength?: number;
    },
  ): Promise<TicketWorkflow> {
    // Get or create workflow
    const workflow = await this.getOrCreateWorkflow(ticketId, projectId);

    this.logger.log(`Generating branch name for ticket ${ticketId}`);

    // Generate branch name using existing service
    const branchResult = await this.branchNameService.generateBranchName(
      projectId,
      ticketId,
      options,
    );

    // Update workflow with branch name
    workflow.generatedBranchName = branchResult.branchName;
    workflow.branchNameMetadata = {
      type: branchResult.type,
      confidence: branchResult.confidence,
      reasoning: branchResult.reasoning,
      alternatives: branchResult.alternatives.map((alt) => alt.name),
      generatedAt: new Date(),
    };
    workflow.status = WorkflowStatus.BRANCH_GENERATED;

    await this.workflowRepository.save(workflow);

    this.logger.log(
      `Branch name generated and saved: ${branchResult.branchName}`,
    );

    return workflow;
  }

  /**
   * Update workflow
   */
  async updateWorkflow(
    ticketId: string,
    updates: UpdateWorkflowDto,
  ): Promise<TicketWorkflow> {
    const workflow = await this.getByTicketId(ticketId);

    if (!workflow) {
      throw new NotFoundException(
        `Workflow for ticket ${ticketId} not found`,
      );
    }

    Object.assign(workflow, updates);
    await this.workflowRepository.save(workflow);

    this.logger.log(`Workflow updated for ticket ${ticketId}`);

    return workflow;
  }

  /**
   * Update analysis status
   */
  async updateAnalysisStatus(
    ticketId: string,
    analysisStatus: AnalysisStatus,
    analysisSessionId?: string,
  ): Promise<TicketWorkflow> {
    const workflow = await this.getByTicketId(ticketId);

    if (!workflow) {
      throw new NotFoundException(
        `Workflow for ticket ${ticketId} not found`,
      );
    }

    workflow.analysisStatus = analysisStatus;
    if (analysisSessionId) {
      workflow.analysisSessionId = analysisSessionId;
    }

    // Update overall status
    if (analysisStatus === AnalysisStatus.COMPLETE) {
      workflow.status = WorkflowStatus.ANALYSIS;
    }

    await this.workflowRepository.save(workflow);

    return workflow;
  }

  /**
   * Get all workflows with pagination
   */
  async findAll(options?: {
    skip?: number;
    take?: number;
    status?: WorkflowStatus;
  }): Promise<{ workflows: TicketWorkflow[]; total: number }> {
    const query = this.workflowRepository
      .createQueryBuilder('workflow')
      .leftJoinAndSelect('workflow.ticket', 'ticket')
      .leftJoinAndSelect('workflow.project', 'project')
      .leftJoinAndSelect('workflow.worktree', 'worktree');

    if (options?.status) {
      query.where('workflow.status = :status', { status: options.status });
    }

    if (options?.skip) {
      query.skip(options.skip);
    }

    if (options?.take) {
      query.take(options.take);
    }

    query.orderBy('workflow.updatedAt', 'DESC');

    const [workflows, total] = await query.getManyAndCount();

    return { workflows, total };
  }

  /**
   * Delete workflow
   */
  async deleteWorkflow(ticketId: string): Promise<void> {
    const workflow = await this.getByTicketId(ticketId);

    if (!workflow) {
      throw new NotFoundException(
        `Workflow for ticket ${ticketId} not found`,
      );
    }

    await this.workflowRepository.remove(workflow);

    this.logger.log(`Workflow deleted for ticket ${ticketId}`);
  }

  /**
   * Create worktree from generated branch name
   */
  async createWorktreeFromBranchName(
    dto: CreateWorktreeFromWorkflowDto,
  ): Promise<TicketWorkflow> {
    this.logger.log(`Creating worktree for ticket ${dto.ticketId}`);

    // Get workflow and verify branch name exists
    const workflow = await this.getByTicketId(dto.ticketId);
    if (!workflow) {
      throw new NotFoundException(
        `Workflow for ticket ${dto.ticketId} not found`,
      );
    }

    if (!workflow.generatedBranchName) {
      throw new BadRequestException(
        'Branch name must be generated first. Please generate a branch name before creating a worktree.',
      );
    }

    // Check if worktree already exists for this workflow
    if (workflow.worktreeId) {
      this.logger.warn(
        `Worktree already exists for workflow ${workflow.id}, checking status...`,
      );

      try {
        const existingWorktree = await this.worktreeService.findOne(
          workflow.worktreeId,
        );

        if (existingWorktree.status === 'active') {
          throw new BadRequestException(
            `Active worktree already exists for this ticket: ${existingWorktree.worktreePath}`,
          );
        }
      } catch (error: any) {
        // If worktree not found in service, we can proceed to create a new one
        if (error.status !== 404) {
          throw error;
        }
      }
    }

    // Get project to get localPath
    const project = await this.projectsService.findOne(workflow.projectId);
    if (!project) {
      throw new NotFoundException(
        `Project with ID ${workflow.projectId} not found`,
      );
    }

    if (!project.localPath) {
      throw new BadRequestException(
        `Project "${project.name}" does not have a localPath configured. Please set the localPath for this project.`,
      );
    }

    // Calculate paths
    // Git repository path: projectLocalPath/subfolder
    // Example: /Users/sabir/projects/30x/silz/backend
    const gitRepoPath = `${project.localPath}/${dto.subfolder}`;

    // Worktree path: projectLocalPath/{subfolder}-worktrees/{branchName}
    // Example: /Users/sabir/projects/30x/silz/backend-worktrees/oss-45-refactor-gate-pass
    const worktreePath = `${project.localPath}/${dto.subfolder}-worktrees/${workflow.generatedBranchName}`;

    this.logger.log(`Git repository path: ${gitRepoPath}`);
    this.logger.log(`Worktree will be created at: ${worktreePath}`);

    // Create worktree using WorktreeService Mode 2b (projectId + subfolder)
    const worktreeDto = {
      projectId: workflow.projectId,
      subfolder: dto.subfolder,
      ticketId: dto.ticketId,
      branchName: workflow.generatedBranchName,
      baseBranch: dto.baseBranch,
      isNewBranch: true,
      envHandling: dto.envHandling || EnvHandling.LINK,
      shareNodeModules: dto.shareNodeModules ?? false,
    };

    let worktree: WorktreeResponseDto;
    try {
      worktree = await this.worktreeService.createWorktree(worktreeDto);
    } catch (error: any) {
      this.logger.error(`Failed to create worktree: ${error.message}`);
      throw new BadRequestException(
        `Failed to create worktree: ${error.message}`,
      );
    }

    // Update workflow with worktree ID and status
    workflow.worktreeId = worktree.id;
    workflow.status = WorkflowStatus.WORKTREE_CREATED;
    workflow.metadata = {
      ...workflow.metadata,
      subfolder: dto.subfolder,
      gitRepoPath,
      worktreePath,
    };

    await this.workflowRepository.save(workflow);

    this.logger.log(
      `Worktree created successfully for ticket ${dto.ticketId}: ${worktreePath}`,
    );

    // Return updated workflow with relations
    return this.getByTicketId(dto.ticketId);
  }

  /**
   * Delete worktree for a ticket
   */
  async deleteWorktree(
    ticketId: string,
    options: { deleteBranch?: boolean; force?: boolean } = {},
  ): Promise<TicketWorkflow> {
    this.logger.log(`Deleting worktree for ticket ${ticketId}`);

    // Get workflow
    const workflow = await this.getByTicketId(ticketId);
    if (!workflow) {
      throw new NotFoundException(`Workflow for ticket ${ticketId} not found`);
    }

    if (!workflow.worktreeId) {
      throw new BadRequestException('No worktree exists for this ticket');
    }

    // Check if Happy session exists
    if (workflow.happySessionId && workflow.happySessionMetadata?.status !== 'stopped') {
      throw new BadRequestException(
        'Cannot delete worktree while Happy session exists. Please stop the session first.',
      );
    }

    // Get worktree details
    const worktree = await this.worktreeService.findOne(workflow.worktreeId);
    if (!worktree) {
      // Worktree record doesn't exist, just clean up workflow
      workflow.worktreeId = null;
      workflow.status = WorkflowStatus.BRANCH_GENERATED;
      await this.workflowRepository.save(workflow);
      return workflow;
    }

    // Remove worktree using service
    await this.worktreeService.removeWorktree(workflow.worktreeId, {
      force: options.force ?? true,
    });

    // Delete branch if requested
    if (options.deleteBranch && workflow.generatedBranchName) {
      this.logger.log(`Deleting branch: ${workflow.generatedBranchName}`);

      // Get project to find git repo path
      const project = await this.projectsService.findOne(workflow.projectId);
      if (project && project.localPath) {
        const subfolder = worktree.metadata?.subfolder || 'backend';
        const gitRepoPath = `${project.localPath}/${subfolder}`;

        try {
          // Delete the branch
          const { exec } = require('child_process');
          const util = require('util');
          const execPromise = util.promisify(exec);

          await execPromise(`git branch -D ${workflow.generatedBranchName}`, {
            cwd: gitRepoPath,
          });

          this.logger.log(`Branch ${workflow.generatedBranchName} deleted`);
        } catch (error: any) {
          this.logger.warn(`Failed to delete branch: ${error.message}`);
          // Don't fail the whole operation if branch deletion fails
        }
      }
    }

    // Update workflow
    workflow.worktreeId = null;
    workflow.status = WorkflowStatus.BRANCH_GENERATED;
    workflow.metadata = {
      ...workflow.metadata,
      deletedWorktreeAt: new Date(),
      deletedWorktreePath: worktree.worktreePath,
    };

    await this.workflowRepository.save(workflow);

    this.logger.log(`Worktree deleted successfully for ticket ${ticketId}`);
    return this.getByTicketId(ticketId);
  }

  /**
   * Start Happy session with context - Simplified version
   * Sends initial context via Claude SDK and returns resume command
   */
  async startHappySession(
    ticketId: string,
    mode: 'implementation' | 'context',
    additionalInstructions?: string,
  ): Promise<TicketWorkflow & { resumeCommands: { cd: string; happy: string } }> {
    this.logger.log(`Initializing Happy session for ticket ${ticketId} in ${mode} mode`);

    // Get workflow with worktree
    const workflow = await this.workflowRepository.findOne({
      where: { ticketId },
      relations: ['ticket', 'worktree'],
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow for ticket ${ticketId} not found`);
    }

    if (!workflow.worktreeId || !workflow.worktree) {
      throw new BadRequestException(
        'Worktree must be created before starting Happy session',
      );
    }

    // Build context message
    const contextMessage = await this.happyContextBuilder.buildContext(ticketId, {
      mode,
      additionalInstructions,
      worktreePath: workflow.worktree.worktreePath,
      branchName: workflow.generatedBranchName,
    });

    try {
      // Generate session ID for this Happy instance
      const sessionId = randomUUID();
      this.logger.log(`Generated session ID: ${sessionId}`);

      // Send the context via Claude SDK (similar to preliminary analysis)
      this.logger.log('Sending initial context via Claude SDK...');

      const queryOptions: any = {
        // Allow all tools for development work
        allowedTools: ['Read', 'Write', 'Edit', 'MultiEdit', 'Bash', 'Grep', 'Glob', 'WebSearch', 'WebFetch'],

        // Set the working directory to the worktree
        cwd: workflow.worktree.worktreePath,

        // Use Claude Opus 4.1 model (same as Happy uses)
        model: 'claude-opus-4-1-20250805',

        maxTurns: 1, // Just send the context and get acknowledgment

        // Use Claude Code preset
        systemPrompt: {
          type: 'preset' as const,
          preset: 'claude_code' as const,
        },

        // Skip permissions like --yolo
        permissionMode: 'bypassPermissions' as const,

        // Force a specific session ID
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

      this.logger.log('Context sent successfully to Claude');
      this.logger.log(`Response preview: ${responseText.substring(0, 200)}...`);

      // Update workflow with Happy session info
      workflow.happySessionId = sessionId;
      workflow.happySessionMetadata = {
        mode,
        startedAt: new Date(),
        status: 'context_sent',
        additionalInstructions,
        initialResponse: responseText.substring(0, 500), // Store first 500 chars
      };
      workflow.status = WorkflowStatus.DEVELOPMENT;

      await this.workflowRepository.save(workflow);

      // Prepare resume commands
      const resumeCommands = {
        cd: `cd ${workflow.worktree.worktreePath}`,
        happy: `happy --yolo --continue`,
      };

      this.logger.log('=== RESUME COMMANDS ===');
      this.logger.log(`1. ${resumeCommands.cd}`);
      this.logger.log(`2. ${resumeCommands.happy}`);
      this.logger.log('=======================');

      // Return workflow with resume commands
      return {
        ...workflow,
        resumeCommands,
      };
    } catch (error: any) {
      this.logger.error(`Failed to initialize Happy session: ${error.message}`);
      throw new BadRequestException(
        `Failed to initialize Happy session: ${error.message}`,
      );
    }
  }

  /**
   * Stop Happy session - Simplified version
   * Just marks the session as stopped in the database
   */
  async stopHappySession(ticketId: string): Promise<TicketWorkflow> {
    const workflow = await this.getByTicketId(ticketId);

    if (!workflow) {
      throw new NotFoundException(`Workflow for ticket ${ticketId} not found`);
    }

    if (!workflow.happySessionId) {
      throw new BadRequestException(`No Happy session found for ticket ${ticketId}`);
    }

    this.logger.log(`Marking Happy session ${workflow.happySessionId} as stopped for ticket ${ticketId}`);

    // Update workflow metadata
    if (workflow.happySessionMetadata) {
      workflow.happySessionMetadata = {
        ...workflow.happySessionMetadata,
        stoppedAt: new Date(),
        status: 'stopped',
      };
      await this.workflowRepository.save(workflow);
    }

    return workflow;
  }

  /**
   * Get Happy session status - Simplified version
   */
  async getHappySessionStatus(ticketId: string): Promise<{
    status: 'context_sent' | 'stopped' | 'not_started' | 'running' | 'crashed';
    sessionId?: string;
    resumeCommands?: { cd: string; happy: string };
    metadata?: any;
  }> {
    const workflow = await this.getByTicketId(ticketId);

    if (!workflow) {
      throw new NotFoundException(`Workflow for ticket ${ticketId} not found`);
    }

    if (!workflow.happySessionId) {
      return { status: 'not_started' };
    }

    // Build resume commands
    const resumeCommands = workflow.worktree ? {
      cd: `cd ${workflow.worktree.worktreePath}`,
      happy: `happy --yolo --continue`,
    } : undefined;

    return {
      status: workflow.happySessionMetadata?.status || 'context_sent',
      sessionId: workflow.happySessionId,
      resumeCommands,
      metadata: workflow.happySessionMetadata,
    };
  }

  /**
   * Verify the work done in a ticket's worktree
   */
  async verifyWork(
    ticketId: string,
    customInstructions?: string,
  ): Promise<any> {
    const workflow = await this.getByTicketId(ticketId);

    if (!workflow) {
      throw new NotFoundException(`Workflow for ticket ${ticketId} not found`);
    }

    // Check if verification is already running
    if (workflow.status === WorkflowStatus.VERIFYING) {
      return {
        status: 'already_running',
        message: 'Verification is already in progress',
      };
    }

    // Update workflow status to verifying
    workflow.status = WorkflowStatus.VERIFYING;
    await this.workflowRepository.save(workflow);

    // Start verification in background
    this.runVerificationInBackground(ticketId, workflow, customInstructions).catch((error) => {
      console.error('Background verification failed:', error);
      // Update status back to development_complete on failure
      workflow.status = WorkflowStatus.DEVELOPMENT_COMPLETE;
      this.workflowRepository.save(workflow);
    });

    // Return immediately
    return {
      status: 'processing',
      message: 'Verification started in background. It may take a few minutes.',
    };
  }

  /**
   * Run verification in background (similar to preliminary analysis)
   */
  private async runVerificationInBackground(
    ticketId: string,
    workflow: TicketWorkflow,
    customInstructions?: string,
  ): Promise<void> {
    console.log(`\n=== Running verification for ticket ${ticketId} in background ===`);
    console.log('Starting at:', new Date().toISOString());

    try {
      // Run the actual verification
      const result = await this.verificationService.verifyWork(ticketId, customInstructions);

      // Update workflow status to verification_complete
      workflow.status = WorkflowStatus.VERIFICATION_COMPLETE;
      await this.workflowRepository.save(workflow);

      console.log(`\n=== Verification Complete for ticket ${ticketId} ===`);
      console.log('Completed at:', new Date().toISOString());
    } catch (error: any) {
      console.error(`\n=== Verification Failed for ticket ${ticketId} ===`);
      console.error('Failed at:', new Date().toISOString());
      console.error('Error:', error.message);

      // Update workflow status back to development_complete on error
      workflow.status = WorkflowStatus.DEVELOPMENT_COMPLETE;
      await this.workflowRepository.save(workflow);

      throw error;
    }
  }

  /**
   * Get the latest verification result for a ticket
   */
  async getLatestVerification(ticketId: string): Promise<VerificationResult | null> {
    return this.verificationService.getLatestVerification(ticketId);
  }

  /**
   * Add review notes to a verification
   */
  async addVerificationReviewNotes(
    verificationId: string,
    notes: string,
    reviewedBy: string,
  ): Promise<VerificationResult> {
    return this.verificationService.addReviewNotes(verificationId, notes, reviewedBy);
  }

  /**
   * Approve ticket for PR creation after verification
   */
  async approveForPR(ticketId: string): Promise<void> {
    const workflow = await this.getByTicketId(ticketId);

    if (!workflow) {
      throw new NotFoundException(`Workflow for ticket ${ticketId} not found`);
    }

    if (workflow.status !== WorkflowStatus.VERIFICATION_COMPLETE) {
      throw new BadRequestException(
        `Cannot approve for PR. Current status: ${workflow.status}. Expected: ${WorkflowStatus.VERIFICATION_COMPLETE}`,
      );
    }

    await this.verificationService.approveForPR(ticketId);
  }

  /**
   * Start verification resolution session
   */
  async startVerificationResolution(
    ticketId: string,
    dto: StartVerificationResolutionDto,
  ): Promise<TicketWorkflow & { resumeCommands: { cd: string; happy: string } }> {
    return this.verificationResolutionService.startResolution(ticketId, dto);
  }

  /**
   * Stop verification resolution session
   */
  async stopVerificationResolution(ticketId: string): Promise<TicketWorkflow> {
    return this.verificationResolutionService.stopResolution(ticketId);
  }

  /**
   * Complete verification resolution
   */
  async completeVerificationResolution(
    ticketId: string,
    completionNotes?: string,
  ): Promise<TicketWorkflow> {
    return this.verificationResolutionService.completeResolution(ticketId, completionNotes);
  }

  /**
   * Get verification resolution status
   */
  async getVerificationResolutionStatus(
    ticketId: string,
  ): Promise<VerificationResolutionStatusDto> {
    return this.verificationResolutionService.getResolutionStatus(ticketId);
  }

  /**
   * Trigger re-verification after resolution
   */
  async triggerReVerification(ticketId: string): Promise<VerificationResult> {
    // First complete the resolution if not already done
    const workflow = await this.getByTicketId(ticketId);
    if (!workflow) {
      throw new NotFoundException(`Workflow for ticket ${ticketId} not found`);
    }

    // Update status to verifying
    workflow.status = WorkflowStatus.VERIFYING;
    await this.workflowRepository.save(workflow);

    // Run verification again
    return this.verificationService.verifyWork(ticketId);
  }

  /**
   * Run integration tests for a ticket
   */
  async runIntegrationTest(
    ticketId: string,
    customInstructions?: string,
  ): Promise<any> {
    const workflow = await this.getByTicketId(ticketId);

    if (!workflow) {
      throw new NotFoundException(`Workflow for ticket ${ticketId} not found`);
    }

    // Check if testing is already running
    if (workflow.status === WorkflowStatus.TESTING_IN_PROGRESS) {
      return {
        status: 'already_running',
        message: 'Integration testing is already in progress',
      };
    }

    // Update workflow status to testing
    workflow.status = WorkflowStatus.TESTING_IN_PROGRESS;
    await this.workflowRepository.save(workflow);

    // Start testing in background
    this.runTestingInBackground(ticketId, workflow, customInstructions).catch((error) => {
      console.error('Background integration testing failed:', error);
      // Update status back to verification_complete on failure
      workflow.status = WorkflowStatus.VERIFICATION_COMPLETE;
      this.workflowRepository.save(workflow);
    });

    // Return immediately
    return {
      status: 'processing',
      message: 'Integration testing started in background. It may take a few minutes.',
    };
  }

  /**
   * Run integration testing in background
   */
  private async runTestingInBackground(
    ticketId: string,
    workflow: TicketWorkflow,
    customInstructions?: string,
  ): Promise<void> {
    console.log(`\n=== Running integration tests for ticket ${ticketId} in background ===`);
    console.log('Starting at:', new Date().toISOString());

    try {
      // Run the actual testing
      const result = await this.integrationTestingService.runIntegrationTests(
        ticketId,
        customInstructions,
      );

      // Update workflow status based on results
      // Status is already updated by the integration testing service

      console.log(`\n=== Integration Testing Complete for ticket ${ticketId} ===`);
      console.log('Completed at:', new Date().toISOString());
    } catch (error: any) {
      console.error(`Background integration testing failed for ticket ${ticketId}:`, error);

      // Update workflow status to error
      workflow.status = WorkflowStatus.TESTING_FAILED;
      workflow.metadata = {
        ...workflow.metadata,
        testingError: `Integration testing failed: ${error.message}`,
        testingErrorAt: new Date(),
      };
      await this.workflowRepository.save(workflow);

      throw error;
    }
  }

  /**
   * Get latest integration test results
   */
  async getLatestTestResults(ticketId: string): Promise<IntegrationTestResult | null> {
    return this.integrationTestingService.getLatestTestResults(ticketId);
  }

  /**
   * Get integration test history
   */
  async getTestHistory(ticketId: string, limit: number = 10): Promise<IntegrationTestResult[]> {
    return this.integrationTestingService.getTestHistory(ticketId);
  }

  /**
   * Mark tests as needing fixes
   */
  async markTestsNeedFix(ticketId: string, issues: string): Promise<void> {
    return this.integrationTestingService.markTestsNeedFix(ticketId, issues);
  }

  /**
   * Approve integration tests
   */
  async approveIntegrationTests(ticketId: string): Promise<void> {
    return this.integrationTestingService.approveTests(ticketId);
  }

}
