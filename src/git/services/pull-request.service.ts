import { Injectable, NotFoundException, ConflictException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PullRequest, PullRequestStatus } from '../entities/pull-request.entity';
import { JiraTicket } from '../../modules/jira/entities/jira-ticket.entity';
import { GitRepository } from '../entities/git-repository.entity';
import { GitService } from './git.service';

interface PullRequestFilters {
  repositoryId?: string;
  status?: PullRequestStatus;
  authorUsername?: string;
}

export interface SyncResult {
  created: number;
  updated: number;
}

@Injectable()
export class PullRequestService {
  constructor(
    @InjectRepository(PullRequest)
    private readonly pullRequestRepository: Repository<PullRequest>,
    @InjectRepository(JiraTicket)
    private readonly jiraTicketRepository: Repository<JiraTicket>,
    @InjectRepository(GitRepository)
    private readonly gitRepositoryRepository: Repository<GitRepository>,
    @Inject(forwardRef(() => GitService))
    private readonly gitService: any
  ) {}

  async create(repositoryId: string, pullRequestData: Partial<PullRequest>): Promise<PullRequest> {
    // Verify repository exists
    const repository = await this.gitRepositoryRepository.findOne({
      where: { id: repositoryId },
    });

    if (!repository) {
      throw new NotFoundException(`Repository with ID ${repositoryId} not found`);
    }

    // Check for existing pull request with same remote ID
    const existing = await this.pullRequestRepository.findOne({
      where: {
        repositoryId,
        remoteId: pullRequestData.remoteId,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Pull request with remote ID ${pullRequestData.remoteId} already exists`
      );
    }

    const pullRequest = this.pullRequestRepository.create({
      ...pullRequestData,
      repositoryId,
      repository,
    });

    return await this.pullRequestRepository.save(pullRequest);
  }

  async findAll(filters?: PullRequestFilters): Promise<PullRequest[]> {
    const where: any = {};

    if (filters?.repositoryId) {
      where.repositoryId = filters.repositoryId;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.authorUsername) {
      where.authorUsername = filters.authorUsername;
    }

    return await this.pullRequestRepository.find({
      where,
      relations: ['repository', 'linkedTickets'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<PullRequest> {
    const pullRequest = await this.pullRequestRepository.findOne({
      where: { id },
      relations: ['repository', 'linkedTickets'],
    });

    if (!pullRequest) {
      throw new NotFoundException(`Pull request with ID ${id} not found`);
    }

    return pullRequest;
  }

  async findByRemoteId(repositoryId: string, remoteId: string): Promise<PullRequest | null> {
    return await this.pullRequestRepository.findOne({
      where: { repositoryId, remoteId },
      relations: ['repository', 'linkedTickets'],
    });
  }

  async update(id: string, updateData: Partial<PullRequest>): Promise<PullRequest> {
    const pullRequest = await this.findOne(id);

    Object.assign(pullRequest, updateData);

    return await this.pullRequestRepository.save(pullRequest);
  }

  async linkToTickets(pullRequestId: string, ticketKeys: string[]): Promise<PullRequest> {
    const pullRequest = await this.findOne(pullRequestId);

    // Find all specified tickets
    const tickets = await this.jiraTicketRepository.find({
      where: { key: In(ticketKeys) },
    });

    // Verify all tickets exist
    if (tickets.length !== ticketKeys.length) {
      const foundKeys = tickets.map((t) => t.key);
      const missingKeys = ticketKeys.filter((k) => !foundKeys.includes(k));
      throw new NotFoundException(`Jira tickets not found: ${missingKeys.join(', ')}`);
    }

    pullRequest.linkedTickets = tickets;

    return await this.pullRequestRepository.save(pullRequest);
  }

  async unlinkFromTickets(pullRequestId: string, ticketKeys: string[]): Promise<PullRequest> {
    const pullRequest = await this.findOne(pullRequestId);

    pullRequest.linkedTickets = pullRequest.linkedTickets.filter(
      (ticket) => !ticketKeys.includes(ticket.key)
    );

    return await this.pullRequestRepository.save(pullRequest);
  }

  async findByTicket(ticketKey: string): Promise<PullRequest[]> {
    const ticket = await this.jiraTicketRepository.findOne({
      where: { key: ticketKey },
      relations: ['pullRequests'],
    });

    if (!ticket) {
      throw new NotFoundException(`Jira ticket with key ${ticketKey} not found`);
    }

    return ticket.pullRequests;
  }

  async findByProject(projectId: string): Promise<PullRequest[]> {
    // Get all repositories for the project
    const repositories = await this.gitRepositoryRepository.find({
      where: { projectId },
    });

    if (repositories.length === 0) {
      return [];
    }

    const repositoryIds = repositories.map((r) => r.id);

    return await this.pullRequestRepository.find({
      where: { repositoryId: In(repositoryIds) },
      relations: ['repository', 'linkedTickets'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateStatus(
    id: string,
    status: PullRequestStatus,
    additionalData?: Partial<PullRequest>
  ): Promise<PullRequest> {
    const pullRequest = await this.findOne(id);

    pullRequest.status = status;

    if (additionalData) {
      Object.assign(pullRequest, additionalData);
    }

    return await this.pullRequestRepository.save(pullRequest);
  }

  async syncFromRemote(
    repositoryId: string,
    remotePRData: any[]
  ): Promise<SyncResult> {
    let created = 0;
    let updated = 0;

    for (const prData of remotePRData) {
      const existing = await this.findByRemoteId(repositoryId, prData.remoteId);

      if (existing) {
        // Update existing pull request
        await this.update(existing.id, prData);
        updated++;
      } else {
        // Create new pull request
        await this.create(repositoryId, {
          ...prData,
          repositoryId,
        });
        created++;
      }
    }

    return { created, updated };
  }

  async remove(id: string): Promise<void> {
    const result = await this.pullRequestRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`Pull request with ID ${id} not found`);
    }
  }

  async syncRepositoryPullRequests(repositoryId: string): Promise<SyncResult> {
    try {
      console.log(`[PullRequestService] Syncing PRs for repository ${repositoryId}`);

      // Fetch PRs from GitHub/GitLab using injected GitService
      const remotePRs = await this.gitService.getPullRequests(repositoryId, 'all');

      console.log(`[PullRequestService] Fetched ${remotePRs.length} PRs from GitHub`);

      if (!remotePRs || remotePRs.length === 0) {
        return { created: 0, updated: 0 };
      }

      // Transform GitHub/GitLab PR data to our database schema
      const transformedPRs = remotePRs.map(pr => {
        // Debug log to see what we're getting
        if (!pr.sourceBranch) {
          console.log(`[PullRequestService] PR #${pr.number} missing sourceBranch:`, pr);
        }

        return {
          remoteId: pr.id?.toString() || pr.number?.toString(),
          number: pr.number,
          title: pr.title,
          description: pr.body || pr.description || '',
          // Don't set 'state' - it's for review state (approved, changes_requested, etc)
          status: pr.state === 'open' ? PullRequestStatus.OPEN :
                  pr.state === 'merged' ? PullRequestStatus.MERGED :
                  PullRequestStatus.CLOSED,
          sourceBranch: pr.sourceBranch || 'unknown',
          targetBranch: pr.targetBranch || 'main',
          authorUsername: pr.author?.username || 'unknown',
          authorAvatarUrl: pr.author?.avatarUrl || '',
          url: pr.url || '',
          createdAt: pr.createdAt,
          updatedAt: pr.updatedAt,
          mergedAt: pr.mergedAt,
          closedAt: pr.closedAt,
          commitsCount: pr.commits || 0,
          additions: pr.additions || 0,
          deletions: pr.deletions || 0,
          changedFiles: pr.changedFiles || 0,
          commentsCount: pr.comments || 0,
          reviewCommentsCount: pr.reviewComments || 0,
          metadata: {
            mergeable: pr.mergeable,
            draft: pr.draft,
            labels: pr.labels,
          },
        };
      });

      // Sync transformed PRs to database
      const result = await this.syncFromRemote(repositoryId, transformedPRs);
      console.log(`[PullRequestService] Sync result:`, result);
      return result;
    } catch (error: any) {
      console.error(`[PullRequestService] Error syncing PRs:`, error.message);
      return { created: 0, updated: 0 };
    }
  }
}