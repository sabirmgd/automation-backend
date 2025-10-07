import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Worktree, WorktreeStatus, EnvHandling } from '../entities/worktree.entity';
import { GitRepository } from '../entities/git-repository.entity';
import { JiraTicket } from '../../modules/jira/entities/jira-ticket.entity';
import { Project } from '../../projects/project.entity';
import { CommandClient } from '../../clients/command/command.client';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  CreateWorktreeDto,
  UpdateWorktreeDto,
  WorktreeListFiltersDto,
  RemoveWorktreeDto,
  WorktreeResponseDto,
  WorktreeStatsDto,
  CleanupWorktreesDto,
  CleanupResultDto,
} from '../dto/worktree.dto';

export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
}

@Injectable()
export class WorktreeService {
  private readonly logger = new Logger(WorktreeService.name);
  private readonly worktreeManagerScript: string;

  constructor(
    @InjectRepository(Worktree)
    private readonly worktreeRepository: Repository<Worktree>,
    @InjectRepository(GitRepository)
    private readonly gitRepositoryRepository: Repository<GitRepository>,
    @InjectRepository(JiraTicket)
    private readonly jiraTicketRepository: Repository<JiraTicket>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly commandClient: CommandClient,
    private readonly configService: ConfigService,
  ) {
    // Path to your worktree manager script
    this.worktreeManagerScript = this.configService.get<string>(
      'WORKTREE_MANAGER_SCRIPT',
      '/Users/sabirsalah/Desktop/projects/30x/worktree-manager.sh',
    );
  }

  /**
   * Create a new worktree
   * Supports two modes:
   * Mode 1: repositoryId (existing GitRepository entity)
   * Mode 2: projectId + subfolder (calculates git repo path)
   */
  async createWorktree(dto: CreateWorktreeDto): Promise<WorktreeResponseDto> {
    this.logger.log(`Creating worktree for branch: ${dto.branchName}`);

    let gitRepoPath: string;
    let projectId: string;
    let repository: GitRepository | null = null;
    let defaultBranch = 'main';

    // Determine which mode and get git repo path
    if (dto.repositoryId) {
      // Mode 1: Use existing GitRepository
      this.logger.log(`Mode 1: Using GitRepository ID: ${dto.repositoryId}`);

      repository = await this.gitRepositoryRepository.findOne({
        where: { id: dto.repositoryId },
        relations: ['project'],
      });

      if (!repository) {
        throw new NotFoundException(`Repository with ID ${dto.repositoryId} not found`);
      }

      if (!repository.localPath) {
        throw new BadRequestException(
          `Repository "${repository.name}" has not been cloned locally. Set localPath first.`,
        );
      }

      gitRepoPath = repository.localPath;
      projectId = repository.projectId;
      defaultBranch = repository.defaultBranch || 'main';

    } else if (dto.projectId && dto.subfolder) {
      // Mode 2: Calculate path from Project + subfolder
      this.logger.log(`Mode 2: Using Project ID: ${dto.projectId}, subfolder: ${dto.subfolder}`);

      const project = await this.projectRepository.findOne({
        where: { id: dto.projectId },
      });

      if (!project) {
        throw new NotFoundException(`Project with ID ${dto.projectId} not found`);
      }

      if (!project.localPath) {
        throw new BadRequestException(
          `Project "${project.name}" does not have a localPath configured.`,
        );
      }

      // Calculate git repo path: projectLocalPath/subfolder
      gitRepoPath = `${project.localPath}/${dto.subfolder}`;
      projectId = dto.projectId;
      this.logger.log(`Calculated git repo path: ${gitRepoPath}`);

    } else {
      throw new BadRequestException(
        'Must provide either repositoryId OR (projectId + subfolder)',
      );
    }

    // Verify ticket if provided
    let ticket: JiraTicket | null = null;
    if (dto.ticketId) {
      ticket = await this.jiraTicketRepository.findOne({
        where: { id: dto.ticketId },
      });

      if (!ticket) {
        throw new NotFoundException(`Jira ticket with ID ${dto.ticketId} not found`);
      }
    }

    // Check if worktree already exists for this branch
    const existing = await this.worktreeRepository.findOne({
      where: {
        branchName: dto.branchName,
        status: WorktreeStatus.ACTIVE,
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Active worktree already exists for branch "${dto.branchName}" at ${existing.worktreePath}`,
      );
    }

    // Determine worktree path
    const worktreePath = this.getWorktreePath(gitRepoPath, dto.branchName);

    // Build command arguments
    const args: string[] = ['create', dto.branchName];

    if (dto.isNewBranch && dto.baseBranch) {
      args.push('-b', dto.baseBranch);
    }

    if (dto.envHandling) {
      args.push('-e', dto.envHandling);
    }

    if (dto.autoSwitch) {
      args.push('--go');
    }

    // Handle node_modules sharing (non-interactive)
    if (dto.shareNodeModules !== undefined) {
      if (dto.shareNodeModules) {
        args.push('--share-node-modules');
      } else {
        args.push('--no-share-node-modules');
      }
    }

    // Execute worktree creation script
    this.logger.log(`Running wth script: ${this.worktreeManagerScript} ${args.join(' ')}`);
    this.logger.log(`Working directory: ${gitRepoPath}`);

    try {
      const result = await this.commandClient
        .command(`${this.worktreeManagerScript} ${args.join(' ')}`)
        .inDirectory(gitRepoPath)
        .withTimeout(60000)
        .run();

      if (!result.success) {
        throw new Error(`Worktree creation failed: ${result.stderr}`);
      }

      this.logger.log(`Worktree created at: ${worktreePath}`);
    } catch (error: any) {
      this.logger.error(`Failed to create worktree: ${error.message}`);
      throw new BadRequestException(`Failed to create worktree: ${error.message}`);
    }

    // Create database record
    const worktree = this.worktreeRepository.create({
      repositoryId: dto.repositoryId || null,
      repository,
      ticketId: dto.ticketId,
      ticket,
      branchName: dto.branchName,
      worktreePath,
      baseBranch: dto.baseBranch || defaultBranch,
      status: WorktreeStatus.ACTIVE,
      envHandling: dto.envHandling || EnvHandling.LINK,
      nodeModulesShared: dto.shareNodeModules || false,
      isNewBranch: dto.isNewBranch || false,
      metadata: {
        createdBy: 'system', // TODO: Add user context
        gitRepoPath,
        projectId,
        subfolder: dto.subfolder,
      },
    });

    const saved = await this.worktreeRepository.save(worktree);

    return this.toResponseDto(saved);
  }

  /**
   * List all worktrees with optional filters
   */
  async listWorktrees(filters?: WorktreeListFiltersDto): Promise<WorktreeResponseDto[]> {
    const query = this.worktreeRepository
      .createQueryBuilder('worktree')
      .leftJoinAndSelect('worktree.repository', 'repository')
      .leftJoinAndSelect('worktree.ticket', 'ticket');

    if (filters?.repositoryId) {
      query.andWhere('worktree.repositoryId = :repositoryId', {
        repositoryId: filters.repositoryId,
      });
    }

    if (filters?.ticketId) {
      query.andWhere('worktree.ticketId = :ticketId', { ticketId: filters.ticketId });
    }

    if (filters?.status) {
      query.andWhere('worktree.status = :status', { status: filters.status });
    }

    if (filters?.branchName) {
      query.andWhere('worktree.branchName ILIKE :branchName', {
        branchName: `%${filters.branchName}%`,
      });
    }

    query.orderBy('worktree.createdAt', 'DESC');

    const worktrees = await query.getMany();

    return worktrees.map((w) => this.toResponseDto(w));
  }

  /**
   * Get a single worktree by ID
   */
  async findOne(id: string): Promise<WorktreeResponseDto> {
    const worktree = await this.worktreeRepository.findOne({
      where: { id },
      relations: ['repository', 'ticket'],
    });

    if (!worktree) {
      throw new NotFoundException(`Worktree with ID ${id} not found`);
    }

    return this.toResponseDto(worktree);
  }

  /**
   * Get worktree by branch name
   */
  async findByBranch(
    repositoryId: string,
    branchName: string,
  ): Promise<WorktreeResponseDto | null> {
    const worktree = await this.worktreeRepository.findOne({
      where: {
        repositoryId,
        branchName,
        status: WorktreeStatus.ACTIVE,
      },
      relations: ['repository', 'ticket'],
    });

    return worktree ? this.toResponseDto(worktree) : null;
  }

  /**
   * Get worktrees by ticket
   */
  async findByTicket(ticketId: string): Promise<WorktreeResponseDto[]> {
    const worktrees = await this.worktreeRepository.find({
      where: { ticketId },
      relations: ['repository', 'ticket'],
      order: { createdAt: 'DESC' },
    });

    return worktrees.map((w) => this.toResponseDto(w));
  }

  /**
   * Get active worktree for a ticket
   */
  async findActiveByTicket(ticketId: string): Promise<WorktreeResponseDto | null> {
    const worktree = await this.worktreeRepository.findOne({
      where: {
        ticketId,
        status: WorktreeStatus.ACTIVE,
      },
      relations: ['repository', 'ticket'],
      order: { createdAt: 'DESC' },
    });

    return worktree ? this.toResponseDto(worktree) : null;
  }

  /**
   * Update worktree metadata
   */
  async updateWorktree(id: string, dto: UpdateWorktreeDto): Promise<WorktreeResponseDto> {
    const worktree = await this.worktreeRepository.findOne({ where: { id } });

    if (!worktree) {
      throw new NotFoundException(`Worktree with ID ${id} not found`);
    }

    if (dto.status) {
      worktree.status = dto.status;
    }

    if (dto.ticketId) {
      const ticket = await this.jiraTicketRepository.findOne({
        where: { id: dto.ticketId },
      });

      if (!ticket) {
        throw new NotFoundException(`Jira ticket with ID ${dto.ticketId} not found`);
      }

      worktree.ticketId = dto.ticketId;
    }

    if (dto.metadata) {
      worktree.metadata = {
        ...worktree.metadata,
        ...dto.metadata,
      };
    }

    const saved = await this.worktreeRepository.save(worktree);

    return this.toResponseDto(saved);
  }

  /**
   * Remove a worktree
   */
  async removeWorktree(id: string, dto?: RemoveWorktreeDto): Promise<void> {
    const worktree = await this.worktreeRepository.findOne({
      where: { id },
      relations: ['repository'],
    });

    if (!worktree) {
      throw new NotFoundException(`Worktree with ID ${id} not found`);
    }

    const repository = worktree.repository;

    if (!repository.localPath) {
      throw new BadRequestException('Repository has no local path configured');
    }

    // Build command arguments
    const args: string[] = ['remove', worktree.branchName];

    if (dto?.force) {
      args.push('-f');
    }

    // Execute worktree removal script
    try {
      const result = await this.commandClient
        .command(`${this.worktreeManagerScript} ${args.join(' ')}`)
        .inDirectory(repository.localPath)
        .withTimeout(30000)
        .run();

      if (!result.success) {
        this.logger.warn(`Worktree removal warning: ${result.stderr}`);
      }

      this.logger.log(`Worktree removed: ${worktree.branchName}`);
    } catch (error: any) {
      this.logger.error(`Failed to remove worktree: ${error.message}`);
      // Continue with database update even if removal fails
    }

    // Update database record
    worktree.status = WorktreeStatus.DELETED;
    worktree.deletedAt = new Date();
    worktree.metadata = {
      ...worktree.metadata,
      deletedBy: 'system', // TODO: Add user context
    };

    await this.worktreeRepository.save(worktree);

    // Optionally delete branch
    if (dto?.deleteBranch && worktree.isNewBranch) {
      try {
        await this.commandClient
          .command(`git branch -D ${worktree.branchName}`)
          .inDirectory(repository.localPath)
          .run();

        this.logger.log(`Deleted branch: ${worktree.branchName}`);
      } catch (error: any) {
        this.logger.warn(`Failed to delete branch: ${error.message}`);
      }
    }
  }

  /**
   * Get worktree path
   */
  getWorktreePath(repositoryPath: string, branchName: string): string {
    const repoName = path.basename(repositoryPath);
    const worktreeBase = path.join(path.dirname(repositoryPath), `${repoName}-worktrees`);
    return path.join(worktreeBase, branchName);
  }

  /**
   * List all git worktrees (using git command)
   */
  async listGitWorktrees(repositoryId: string): Promise<WorktreeInfo[]> {
    const repository = await this.gitRepositoryRepository.findOne({
      where: { id: repositoryId },
    });

    if (!repository) {
      throw new NotFoundException(`Repository with ID ${repositoryId} not found`);
    }

    if (!repository.localPath) {
      throw new BadRequestException('Repository has no local path configured');
    }

    try {
      const result = await this.commandClient
        .command('git worktree list --porcelain')
        .inDirectory(repository.localPath)
        .run();

      if (!result.success) {
        throw new Error(result.stderr);
      }

      return this.parseGitWorktreeList(result.stdout);
    } catch (error: any) {
      this.logger.error(`Failed to list git worktrees: ${error.message}`);
      throw new BadRequestException(`Failed to list git worktrees: ${error.message}`);
    }
  }

  /**
   * Clean up stale worktrees
   */
  async cleanupWorktrees(
    repositoryId: string,
    dto?: CleanupWorktreesDto,
  ): Promise<CleanupResultDto> {
    const repository = await this.gitRepositoryRepository.findOne({
      where: { id: repositoryId },
    });

    if (!repository) {
      throw new NotFoundException(`Repository with ID ${repositoryId} not found`);
    }

    if (!repository.localPath) {
      throw new BadRequestException('Repository has no local path configured');
    }

    const result: CleanupResultDto = {
      pruned: 0,
      orphanedRemoved: 0,
      errors: [],
      freedDiskSpace: 0,
    };

    // Prune stale git worktree entries
    if (dto?.pruneStale !== false) {
      try {
        if (!dto?.dryRun) {
          await this.commandClient
            .command('git worktree prune')
            .inDirectory(repository.localPath)
            .run();
        }

        result.pruned++;
        this.logger.log('Pruned stale worktree entries');
      } catch (error: any) {
        result.errors.push(`Prune failed: ${error.message}`);
      }
    }

    // Find and remove orphaned worktrees in database
    if (dto?.removeOrphaned !== false) {
      const gitWorktrees = await this.listGitWorktrees(repositoryId);
      const gitBranches = gitWorktrees.map((w) => w.branch);

      const dbWorktrees = await this.worktreeRepository.find({
        where: {
          repositoryId,
          status: WorktreeStatus.ACTIVE,
        },
      });

      for (const dbWorktree of dbWorktrees) {
        // Check if worktree still exists in git
        if (!gitBranches.includes(dbWorktree.branchName)) {
          this.logger.warn(`Found orphaned worktree in DB: ${dbWorktree.branchName}`);

          if (!dto?.dryRun) {
            dbWorktree.status = WorktreeStatus.STALE;
            dbWorktree.metadata = {
              ...dbWorktree.metadata,
              markedStaleAt: new Date(),
            };
            await this.worktreeRepository.save(dbWorktree);
          }

          result.orphanedRemoved++;
        }
      }
    }

    return result;
  }

  /**
   * Get worktree statistics
   */
  async getWorktreeStats(repositoryId?: string): Promise<WorktreeStatsDto> {
    const query = this.worktreeRepository
      .createQueryBuilder('worktree')
      .leftJoinAndSelect('worktree.repository', 'repository')
      .leftJoinAndSelect('worktree.ticket', 'ticket');

    if (repositoryId) {
      query.where('worktree.repositoryId = :repositoryId', { repositoryId });
    }

    const worktrees = await query.getMany();

    const stats: WorktreeStatsDto = {
      total: worktrees.length,
      active: worktrees.filter((w) => w.status === WorktreeStatus.ACTIVE).length,
      deleted: worktrees.filter((w) => w.status === WorktreeStatus.DELETED).length,
      stale: worktrees.filter((w) => w.status === WorktreeStatus.STALE).length,
      totalDiskUsage: worktrees.reduce((sum, w) => sum + (w.metadata?.diskUsage || 0), 0),
      byRepository: [],
      byTicket: [],
    };

    // Group by repository
    const repoMap = new Map<string, { name: string; count: number }>();
    for (const worktree of worktrees) {
      const repoId = worktree.repositoryId;
      const repoName = worktree.repository?.name || 'Unknown';

      if (repoMap.has(repoId)) {
        repoMap.get(repoId)!.count++;
      } else {
        repoMap.set(repoId, { name: repoName, count: 1 });
      }
    }

    stats.byRepository = Array.from(repoMap.entries()).map(([repositoryId, data]) => ({
      repositoryId,
      repositoryName: data.name,
      count: data.count,
    }));

    // Group by ticket
    const ticketMap = new Map<string, { key: string; count: number }>();
    for (const worktree of worktrees.filter((w) => w.ticketId)) {
      const ticketId = worktree.ticketId!;
      const ticketKey = worktree.ticket?.key || 'Unknown';

      if (ticketMap.has(ticketId)) {
        ticketMap.get(ticketId)!.count++;
      } else {
        ticketMap.set(ticketId, { key: ticketKey, count: 1 });
      }
    }

    stats.byTicket = Array.from(ticketMap.entries()).map(([ticketId, data]) => ({
      ticketId,
      ticketKey: data.key,
      count: data.count,
    }));

    return stats;
  }

  /**
   * Switch to a worktree (returns path)
   */
  async switchToWorktree(id: string): Promise<string> {
    const worktree = await this.worktreeRepository.findOne({ where: { id } });

    if (!worktree) {
      throw new NotFoundException(`Worktree with ID ${id} not found`);
    }

    if (worktree.status !== WorktreeStatus.ACTIVE) {
      throw new BadRequestException(`Worktree is not active (status: ${worktree.status})`);
    }

    // Update last accessed
    worktree.metadata = {
      ...worktree.metadata,
      lastAccessedAt: new Date(),
    };
    await this.worktreeRepository.save(worktree);

    return worktree.worktreePath;
  }

  /**
   * Private helper: Parse git worktree list output
   */
  private parseGitWorktreeList(output: string): WorktreeInfo[] {
    const worktrees: WorktreeInfo[] = [];
    const lines = output.split('\n').filter((l) => l.trim());

    let currentWorktree: Partial<WorktreeInfo> = {};

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (currentWorktree.path) {
          worktrees.push(currentWorktree as WorktreeInfo);
        }
        currentWorktree = { path: line.substring(9).trim() };
      } else if (line.startsWith('HEAD ')) {
        currentWorktree.commit = line.substring(5).trim();
      } else if (line.startsWith('branch ')) {
        currentWorktree.branch = line.substring(7).trim().replace('refs/heads/', '');
        currentWorktree.isMain = false;
      } else if (line === 'bare') {
        currentWorktree.isMain = true;
      }
    }

    if (currentWorktree.path) {
      worktrees.push(currentWorktree as WorktreeInfo);
    }

    return worktrees;
  }

  /**
   * Private helper: Convert entity to response DTO
   */
  private toResponseDto(worktree: Worktree): WorktreeResponseDto {
    return {
      id: worktree.id,
      repositoryId: worktree.repositoryId,
      repositoryName: worktree.repository?.name,
      ticketId: worktree.ticketId,
      ticketKey: worktree.ticket?.key,
      branchName: worktree.branchName,
      worktreePath: worktree.worktreePath,
      baseBranch: worktree.baseBranch,
      status: worktree.status,
      envHandling: worktree.envHandling,
      nodeModulesShared: worktree.nodeModulesShared,
      isNewBranch: worktree.isNewBranch,
      metadata: worktree.metadata,
      createdAt: worktree.createdAt,
      updatedAt: worktree.updatedAt,
      deletedAt: worktree.deletedAt,
    };
  }
}
