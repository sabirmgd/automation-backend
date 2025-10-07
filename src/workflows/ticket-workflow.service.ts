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
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';

@Injectable()
export class TicketWorkflowService {
  private readonly logger = new Logger(TicketWorkflowService.name);

  private runningHappyProcesses: Map<string, ChildProcess> = new Map();

  constructor(
    @InjectRepository(TicketWorkflow)
    private readonly workflowRepository: Repository<TicketWorkflow>,
    private readonly branchNameService: BranchNameService,
    private readonly jiraTicketService: JiraTicketService,
    private readonly worktreeService: WorktreeService,
    private readonly projectsService: ProjectsService,
    private readonly happyContextBuilder: HappyContextBuilder,
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
   * Start Happy session with context
   */
  async startHappySession(
    ticketId: string,
    mode: 'implementation' | 'context',
    additionalInstructions?: string,
  ): Promise<TicketWorkflow> {
    this.logger.log(`Starting Happy session for ticket ${ticketId} in ${mode} mode`);

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

    // Check if Happy session already running
    if (workflow.happyProcessId && this.runningHappyProcesses.has(ticketId)) {
      throw new BadRequestException(
        `Happy session already running for ticket ${ticketId}`,
      );
    }

    // Build context message
    const contextMessage = await this.happyContextBuilder.buildContext(ticketId, {
      mode,
      additionalInstructions,
      worktreePath: workflow.worktree.worktreePath,
      branchName: workflow.generatedBranchName,
    });

    // Start Happy using expect script
    const expectScriptPath = path.join(
      __dirname,
      '..',
      '..',
      'scripts',
      'start-happy-with-context.exp',
    );

    try {
      // Spawn expect script with context message and worktree path
      const happyProcess = spawn('expect', [
        expectScriptPath,
        contextMessage,
        workflow.worktree.worktreePath,
      ], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Store process reference
      this.runningHappyProcesses.set(ticketId, happyProcess);

      // Get the latest session ID from Claude files after a delay
      const sessionId = await this.getLatestClaudeSessionId(
        workflow.worktree.worktreePath,
      );

      // Update workflow with Happy session info
      workflow.happySessionId = sessionId;
      workflow.happyProcessId = happyProcess.pid;
      workflow.happySessionMetadata = {
        mode,
        startedAt: new Date(),
        status: 'running',
        additionalInstructions,
      };
      workflow.status = WorkflowStatus.DEVELOPMENT;

      await this.workflowRepository.save(workflow);

      // Handle process exit
      happyProcess.on('exit', async (code, signal) => {
        this.logger.log(
          `Happy session for ticket ${ticketId} exited with code ${code}`,
        );
        this.runningHappyProcesses.delete(ticketId);

        // Update workflow status
        const updatedWorkflow = await this.workflowRepository.findOne({
          where: { ticketId },
        });

        if (updatedWorkflow && updatedWorkflow.happySessionMetadata) {
          updatedWorkflow.happySessionMetadata = {
            ...updatedWorkflow.happySessionMetadata,
            stoppedAt: new Date(),
            status: code === 0 ? 'stopped' : 'crashed',
          };
          await this.workflowRepository.save(updatedWorkflow);
        }
      });

      this.logger.log(
        `Happy session started for ticket ${ticketId} with PID ${happyProcess.pid}`,
      );

      return workflow;
    } catch (error: any) {
      this.logger.error(`Failed to start Happy session: ${error.message}`);
      throw new BadRequestException(
        `Failed to start Happy session: ${error.message}`,
      );
    }
  }

  /**
   * Stop Happy session
   */
  async stopHappySession(ticketId: string): Promise<TicketWorkflow> {
    const workflow = await this.getByTicketId(ticketId);

    if (!workflow) {
      throw new NotFoundException(`Workflow for ticket ${ticketId} not found`);
    }

    const process = this.runningHappyProcesses.get(ticketId);

    if (process) {
      this.logger.log(`Stopping Happy session for ticket ${ticketId}`);

      try {
        // Try graceful shutdown first
        process.kill('SIGTERM');

        // Wait a bit for graceful shutdown
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Force kill if still running
        if (this.runningHappyProcesses.has(ticketId)) {
          process.kill('SIGKILL');
        }

        this.runningHappyProcesses.delete(ticketId);
      } catch (error: any) {
        this.logger.error(`Error killing process: ${error.message}`);
      }
    }

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
   * Get Happy session status
   */
  async getHappySessionStatus(ticketId: string): Promise<{
    status: 'running' | 'stopped' | 'crashed' | 'not_started';
    sessionId?: string;
    processId?: number;
    metadata?: any;
  }> {
    const workflow = await this.getByTicketId(ticketId);

    if (!workflow) {
      throw new NotFoundException(`Workflow for ticket ${ticketId} not found`);
    }

    if (!workflow.happySessionId) {
      return { status: 'not_started' };
    }

    // Check if process is actually running
    const isRunning = this.runningHappyProcesses.has(ticketId);

    return {
      status: isRunning
        ? 'running'
        : workflow.happySessionMetadata?.status || 'stopped',
      sessionId: workflow.happySessionId,
      processId: workflow.happyProcessId,
      metadata: workflow.happySessionMetadata,
    };
  }

  /**
   * Get the latest Claude session ID from the project's session files
   */
  private async getLatestClaudeSessionId(
    worktreePath: string,
  ): Promise<string> {
    // Wait a bit for Happy to create the session file
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Get project path for Claude sessions
    const projectPath = worktreePath.replace(/\//g, '-');
    const claudeSessionsPath = path.join(
      process.env.HOME || '~',
      '.claude',
      'projects',
      projectPath,
    );

    try {
      // List all .jsonl files in the directory
      const files = await fs.readdir(claudeSessionsPath);
      const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));

      if (jsonlFiles.length === 0) {
        throw new Error('No Claude session files found');
      }

      // Get the most recent file
      const fileStats = await Promise.all(
        jsonlFiles.map(async (file) => {
          const filePath = path.join(claudeSessionsPath, file);
          const stats = await fs.stat(filePath);
          return {
            file,
            mtime: stats.mtime.getTime(),
          };
        }),
      );

      // Sort by modification time and get the most recent
      fileStats.sort((a, b) => b.mtime - a.mtime);
      const latestFile = fileStats[0].file;

      // Extract session ID from filename (remove .jsonl extension)
      const sessionId = latestFile.replace('.jsonl', '');

      this.logger.log(`Found latest Claude session ID: ${sessionId}`);
      return sessionId;
    } catch (error: any) {
      this.logger.warn(
        `Could not find Claude session ID: ${error.message}. Using placeholder.`,
      );
      // Return a placeholder if we can't find the session ID
      return `session-${Date.now()}`;
    }
  }
}
