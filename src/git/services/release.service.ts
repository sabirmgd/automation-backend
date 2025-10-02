import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Release } from '../entities/release.entity';
import { GitRepository, GitProvider } from '../entities/git-repository.entity';
import { CreateReleaseDto } from '../dto/create-release.dto';
import { GitHubMrManager } from '../../clients/mr-manager/github-mr.manager';
import { GitLabMrManager } from '../../clients/mr-manager/gitlab-mr.manager';
import { ConflictCheckResult, PullRequestResult } from '../../clients/mr-manager/abstract-mr.manager';

@Injectable()
export class ReleaseService {
  private readonly logger = new Logger(ReleaseService.name);

  constructor(
    @InjectRepository(Release)
    private readonly releaseRepository: Repository<Release>,
    @InjectRepository(GitRepository)
    private readonly gitRepository: Repository<GitRepository>,
    private readonly githubMrManager: GitHubMrManager,
    private readonly gitlabMrManager: GitLabMrManager,
  ) {}

  async create(createReleaseDto: CreateReleaseDto): Promise<Release> {
    const repositories = await this.gitRepository.findBy({
      id: createReleaseDto.repositoryIds as any,
    });

    if (repositories.length !== createReleaseDto.repositoryIds.length) {
      throw new NotFoundException('One or more repositories not found');
    }

    const release = this.releaseRepository.create({
      ...createReleaseDto,
      repositories,
    });

    return this.releaseRepository.save(release);
  }

  async findAll(): Promise<Release[]> {
    return this.releaseRepository.find({
      relations: ['repositories'],
    });
  }

  async findOne(id: string): Promise<Release> {
    const release = await this.releaseRepository.findOne({
      where: { id },
      relations: ['repositories'],
    });

    if (!release) {
      throw new NotFoundException(`Release ${id} not found`);
    }

    return release;
  }

  async executeRelease(id: string): Promise<{
    release: Release;
    results: Array<{
      repository: string;
      pullRequest?: PullRequestResult;
      conflicts?: ConflictCheckResult;
      error?: string;
    }>;
  }> {
    const release = await this.findOne(id);
    const results = [];

    for (const repo of release.repositories) {
      try {
        const mrManager = this.getMrManager(repo.provider);
        const repoIdentifier = repo.provider === GitProvider.GITHUB
          ? `${repo.namespace}/${repo.name}`
          : repo.remoteId || `${repo.namespace}/${repo.name}`;

        const conflicts = await mrManager.checkForConflicts(
          repoIdentifier,
          release.fromBranch,
          release.toBranch,
        );

        if (conflicts.hasConflicts) {
          results.push({
            repository: repo.name,
            conflicts,
            error: 'Merge conflicts detected',
          });
          continue;
        }

        const title = this.processTemplate(
          release.prTitleTemplate || `Release: ${release.fromBranch} -> ${release.toBranch}`,
          { release, repo },
        );

        const description = this.processTemplate(
          release.prDescriptionTemplate || `Automated release from ${release.fromBranch} to ${release.toBranch}`,
          { release, repo },
        );

        const pullRequest = await mrManager.createPullRequest(
          repoIdentifier,
          release.fromBranch,
          release.toBranch,
          title,
          description,
        );

        results.push({
          repository: repo.name,
          pullRequest,
        });

        this.logger.log(
          `Created PR/MR #${pullRequest.number} for ${repo.name}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to create PR/MR for ${repo.name}: ${error.message}`,
        );
        results.push({
          repository: repo.name,
          error: error.message,
        });
      }
    }

    release.lastExecutedAt = new Date();
    await this.releaseRepository.save(release);

    return { release, results };
  }

  async checkConflicts(id: string): Promise<{
    release: Release;
    conflicts: Array<{
      repository: string;
      result: ConflictCheckResult;
    }>;
  }> {
    const release = await this.findOne(id);
    const conflicts = [];

    for (const repo of release.repositories) {
      try {
        const mrManager = this.getMrManager(repo.provider);
        const repoIdentifier = repo.provider === GitProvider.GITHUB
          ? `${repo.namespace}/${repo.name}`
          : repo.remoteId || `${repo.namespace}/${repo.name}`;

        const result = await mrManager.checkForConflicts(
          repoIdentifier,
          release.fromBranch,
          release.toBranch,
        );

        conflicts.push({
          repository: repo.name,
          result,
        });
      } catch (error) {
        this.logger.error(
          `Failed to check conflicts for ${repo.name}: ${error.message}`,
        );
        conflicts.push({
          repository: repo.name,
          result: {
            hasConflicts: true,
            canAutoMerge: false,
          },
        });
      }
    }

    return { release, conflicts };
  }

  async update(id: string, updateReleaseDto: Partial<CreateReleaseDto>): Promise<Release> {
    const release = await this.findOne(id);

    if (updateReleaseDto.repositoryIds) {
      const repositories = await this.gitRepository.findBy({
        id: updateReleaseDto.repositoryIds as any,
      });
      release.repositories = repositories;
    }

    Object.assign(release, updateReleaseDto);
    return this.releaseRepository.save(release);
  }

  async remove(id: string): Promise<void> {
    const release = await this.findOne(id);
    await this.releaseRepository.remove(release);
  }

  private getMrManager(provider: GitProvider) {
    switch (provider) {
      case GitProvider.GITHUB:
        return this.githubMrManager;
      case GitProvider.GITLAB:
        return this.gitlabMrManager;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  private processTemplate(
    template: string,
    context: { release: Release; repo: GitRepository },
  ): string {
    return template
      .replace(/{{releaseName}}/g, context.release.name)
      .replace(/{{fromBranch}}/g, context.release.fromBranch)
      .replace(/{{toBranch}}/g, context.release.toBranch)
      .replace(/{{repoName}}/g, context.repo.name)
      .replace(/{{date}}/g, new Date().toISOString().split('T')[0]);
  }
}