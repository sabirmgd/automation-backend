import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PullRequest, PullRequestStatus } from '../entities/pull-request.entity';
import { JiraTicket } from '../../modules/jira/entities/jira-ticket.entity';
import { GitRepository } from '../entities/git-repository.entity';

interface PullRequestFilters {
  repositoryId?: string;
  status?: PullRequestStatus;
  authorUsername?: string;
}

interface SyncResult {
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
    private readonly gitRepositoryRepository: Repository<GitRepository>
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
}