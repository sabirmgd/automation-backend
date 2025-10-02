import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Pipeline, PipelineStatus } from '../entities/pipeline.entity';
import { PullRequest } from '../entities/pull-request.entity';
import { Job, JobStatus } from '../entities/job.entity';
import { GitRepository } from '../entities/git-repository.entity';
import { GitCredential } from '../entities/git-credential.entity';
import { GitHubPipelineManager } from '../../clients/pipeline-manager/github-pipeline.manager';
import { GitLabPipelineManager } from '../../clients/pipeline-manager/gitlab-pipeline.manager';

interface SyncResult {
  created: number;
  updated: number;
  failed: number;
}

interface PipelineData {
  id: string;
  iid: number;
  sha: string;
  ref: string;
  status: string;
  source: string;
  webUrl: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  duration?: number;
  queuedDuration?: number;
  coverage?: number;
  beforeSha?: string;
  tag: boolean;
  yamlErrors?: string;
  user?: any;
  commit?: any;
  jobs?: any[];
  stages?: any[];
  variables?: any[];
}

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    @InjectRepository(Pipeline)
    private pipelineRepository: Repository<Pipeline>,
    @InjectRepository(Job)
    private jobRepository: Repository<Job>,
    @InjectRepository(PullRequest)
    private pullRequestRepository: Repository<PullRequest>,
    @InjectRepository(GitRepository)
    private gitRepositoryRepository: Repository<GitRepository>,
    @InjectRepository(GitCredential)
    private gitCredentialRepository: Repository<GitCredential>,
    private githubPipelineManager: GitHubPipelineManager,
    private gitlabPipelineManager: GitLabPipelineManager,
  ) {}

  /**
   * Sync failed pipelines from all open pull requests for a repository
   */
  async syncFailedPipelinesFromOpenPRs(repositoryId: string): Promise<SyncResult> {
    try {
      this.logger.log(`[PipelineService] Starting pipeline sync for repository ${repositoryId}`);

      // Get the repository
      const repository = await this.gitRepositoryRepository.findOne({
        where: { id: repositoryId },
      });

      if (!repository) {
        throw new Error(`Repository ${repositoryId} not found`);
      }

      // Get all open pull requests for this repository
      const { PullRequestStatus } = await import('../entities/pull-request.entity');
      const openPRs = await this.pullRequestRepository.find({
        where: {
          repositoryId,
          status: PullRequestStatus.OPEN,
        },
      });

      this.logger.log(`[PipelineService] Found ${openPRs.length} open PRs`);

      const result: SyncResult = {
        created: 0,
        updated: 0,
        failed: 0,
      };

      // For each open PR, fetch and sync its failed pipelines
      for (const pr of openPRs) {
        try {
          let pipelines: PipelineData[] = [];

          if (repository.provider === 'github') {
            pipelines = await this.fetchGitHubPipelines(repository, pr);
          } else if (repository.provider === 'gitlab') {
            pipelines = await this.fetchGitLabPipelines(repository, pr);
          }

          // Filter for failed pipelines only
          const failedPipelines = pipelines.filter(p =>
            p.status === 'failed' || p.status === 'failure'
          );

          this.logger.log(`[PipelineService] Found ${failedPipelines.length} failed pipelines for PR #${pr.number}`);

          // Sync each failed pipeline
          for (const pipelineData of failedPipelines) {
            const syncResult = await this.syncPipeline(pipelineData, repository.id, pr.id);
            if (syncResult === 'created') result.created++;
            else if (syncResult === 'updated') result.updated++;
            else result.failed++;
          }
        } catch (error) {
          this.logger.error(`Failed to sync pipelines for PR #${pr.number}:`, error);
          result.failed++;
        }
      }

      this.logger.log(`[PipelineService] Sync complete:`, result);
      return result;
    } catch (error) {
      this.logger.error('[PipelineService] Pipeline sync failed:', error);
      throw error;
    }
  }

  /**
   * Fetch pipelines from GitHub Actions
   */
  private async fetchGitHubPipelines(repository: GitRepository, pr: PullRequest): Promise<PipelineData[]> {
    try {
      // Get credential for this repository
      const credential = await this.gitCredentialRepository.findOne({
        where: { id: repository.credentialId },
      });

      if (!credential) {
        this.logger.error(`No credential found for repository ${repository.id}`);
        return [];
      }

      // Construct the full repository name (owner/repo)
      const fullName = repository.namespace
        ? `${repository.namespace}/${repository.name}`
        : repository.name;

      // Use pipeline manager to get failed pipelines with jobs
      const failedPipelines = await this.githubPipelineManager.getFailedPipelines(
        fullName,
        pr.number,
        credential.encryptedToken,
      );

      // For each failed pipeline, get its details including jobs
      const pipelinesWithJobs = await Promise.all(
        failedPipelines.map(async (pipeline) => {
          const details = await this.githubPipelineManager.getPipelineDetails(
            fullName,
            pipeline.id,
            credential.encryptedToken,
          );

          return {
            id: details.id.toString(),
            iid: Number(details.id),
            sha: details.sha,
            ref: details.ref,
            status: details.conclusion || details.status,
            source: 'github_actions',
            webUrl: details.url || '',
            createdAt: new Date(details.createdAt),
            updatedAt: new Date(details.updatedAt),
            tag: false,
            jobs: details.jobs?.map(job => ({
              id: job.id.toString(),
              name: job.name,
              stage: job.stage || 'default',
              status: job.conclusion || job.status,
              started_at: job.startedAt,
              finished_at: job.completedAt,
              duration: job.duration,
              allow_failure: job.allowFailure || false,
            })) || [],
          };
        })
      );

      return pipelinesWithJobs;
    } catch (error) {
      this.logger.error(`Failed to fetch GitHub pipelines:`, error);
      return [];
    }
  }

  /**
   * Fetch pipelines from GitLab CI
   */
  private async fetchGitLabPipelines(repository: GitRepository, pr: PullRequest): Promise<PipelineData[]> {
    try {
      // Get credential for this repository
      const credential = await this.gitCredentialRepository.findOne({
        where: { id: repository.credentialId },
      });

      if (!credential) {
        this.logger.error(`No credential found for repository ${repository.id}`);
        return [];
      }

      // Use pipeline manager to get failed pipelines with jobs
      const failedPipelines = await this.gitlabPipelineManager.getFailedPipelines(
        repository.remoteId,
        pr.number,
        credential.encryptedToken,
      );

      // For each failed pipeline, get its details including jobs
      const pipelinesWithJobs = await Promise.all(
        failedPipelines.map(async (pipeline) => {
          const details = await this.gitlabPipelineManager.getPipelineDetails(
            repository.remoteId,
            pipeline.id,
            credential.encryptedToken,
          );

          return {
            id: details.id.toString(),
            iid: Number(details.id),
            sha: details.sha,
            ref: details.ref,
            status: details.status,
            source: 'gitlab_ci',
            webUrl: details.url || '',
            createdAt: new Date(details.createdAt),
            updatedAt: new Date(details.updatedAt),
            tag: false,
            jobs: details.jobs?.map(job => ({
              id: job.id.toString(),
              name: job.name,
              stage: job.stage || 'default',
              status: job.status,
              started_at: job.startedAt,
              finished_at: job.completedAt,
              duration: job.duration,
              allow_failure: job.allowFailure || false,
            })) || [],
          };
        })
      );

      return pipelinesWithJobs;
    } catch (error) {
      this.logger.error(`Failed to fetch GitLab pipelines:`, error);
      return [];
    }
  }

  /**
   * Sync a single pipeline to the database
   */
  private async syncPipeline(
    pipelineData: PipelineData,
    repositoryId: string,
    pullRequestId: string
  ): Promise<'created' | 'updated' | 'failed'> {
    try {
      // Check if pipeline already exists
      let pipeline = await this.pipelineRepository.findOne({
        where: { id: pipelineData.id },
      });

      if (pipeline) {
        // Update existing pipeline
        pipeline.status = this.mapPipelineStatus(pipelineData.status);
        pipeline.updatedAt = pipelineData.updatedAt;
        pipeline.finishedAt = pipelineData.finishedAt;
        pipeline.duration = pipelineData.duration;
        pipeline.coverage = pipelineData.coverage;
        pipeline.yamlErrors = pipelineData.yamlErrors;

        await this.pipelineRepository.save(pipeline);

        // Sync jobs if they exist in the pipeline data
        if (pipelineData.jobs && pipelineData.jobs.length > 0) {
          const jobSyncResult = await this.syncFailedJobsForPipeline(pipeline.id, pipelineData.jobs);
          this.logger.log(`[PipelineService] Updated jobs for pipeline ${pipeline.id}:`, jobSyncResult);
        }

        return 'updated';
      } else {
        // Create new pipeline
        pipeline = this.pipelineRepository.create({
          id: pipelineData.id,
          iid: pipelineData.iid,
          projectId: repositoryId, // Using repositoryId as projectId for consistency
          repositoryId,
          pullRequestId,
          sha: pipelineData.sha,
          ref: pipelineData.ref,
          status: this.mapPipelineStatus(pipelineData.status),
          source: pipelineData.source,
          webUrl: pipelineData.webUrl,
          createdAt: pipelineData.createdAt,
          updatedAt: pipelineData.updatedAt,
          startedAt: pipelineData.startedAt,
          finishedAt: pipelineData.finishedAt,
          duration: pipelineData.duration,
          queuedDuration: pipelineData.queuedDuration,
          coverage: pipelineData.coverage,
          beforeSha: pipelineData.beforeSha,
          tag: pipelineData.tag,
          yamlErrors: pipelineData.yamlErrors,
          user: pipelineData.user,
          commit: pipelineData.commit,
          stages: pipelineData.stages,
          variables: pipelineData.variables,
        });

        await this.pipelineRepository.save(pipeline);

        // Sync jobs if they exist in the pipeline data
        if (pipelineData.jobs && pipelineData.jobs.length > 0) {
          const jobSyncResult = await this.syncFailedJobsForPipeline(pipeline.id, pipelineData.jobs);
          this.logger.log(`[PipelineService] Synced jobs for pipeline ${pipeline.id}:`, jobSyncResult);
        }

        return 'created';
      }
    } catch (error) {
      this.logger.error(`Failed to sync pipeline ${pipelineData.id}:`, error);
      return 'failed';
    }
  }

  /**
   * Map pipeline status string to enum
   */
  private mapPipelineStatus(status: string): PipelineStatus {
    const statusMap: Record<string, PipelineStatus> = {
      'created': PipelineStatus.CREATED,
      'waiting_for_resource': PipelineStatus.WAITING_FOR_RESOURCE,
      'preparing': PipelineStatus.PREPARING,
      'pending': PipelineStatus.PENDING,
      'running': PipelineStatus.RUNNING,
      'success': PipelineStatus.SUCCESS,
      'failed': PipelineStatus.FAILED,
      'failure': PipelineStatus.FAILED,
      'canceled': PipelineStatus.CANCELED,
      'cancelled': PipelineStatus.CANCELED,
      'skipped': PipelineStatus.SKIPPED,
      'manual': PipelineStatus.MANUAL,
      'scheduled': PipelineStatus.SCHEDULED,
    };

    return statusMap[status.toLowerCase()] || PipelineStatus.FAILED;
  }

  /**
   * Get all failed pipelines from open PRs
   */
  async getFailedPipelinesFromOpenPRs(repositoryId?: string): Promise<Pipeline[]> {
    const query = this.pipelineRepository.createQueryBuilder('pipeline')
      .innerJoin('pipeline.pullRequest', 'pullRequest')
      .where('pipeline.status = :status', { status: PipelineStatus.FAILED })
      .andWhere('pullRequest.status = :prStatus', { prStatus: 'open' });

    if (repositoryId) {
      query.andWhere('pipeline.repositoryId = :repositoryId', { repositoryId });
    }

    return query
      .leftJoinAndSelect('pipeline.pullRequest', 'pr')
      .leftJoinAndSelect('pipeline.jobs', 'jobs')
      .leftJoinAndSelect('pipeline.analysis', 'analysis')
      .orderBy('pipeline.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Get all failed jobs from open PRs
   */
  async getFailedJobsFromOpenPRs(repositoryId?: string): Promise<Job[]> {
    const query = this.jobRepository.createQueryBuilder('job')
      .innerJoin('job.pipeline', 'pipeline')
      .innerJoin('pipeline.pullRequest', 'pullRequest')
      .where('job.status = :status', { status: JobStatus.FAILED })
      .andWhere('pullRequest.status = :prStatus', { prStatus: 'open' });

    if (repositoryId) {
      query.andWhere('pipeline.repositoryId = :repositoryId', { repositoryId });
    }

    return query
      .leftJoinAndSelect('job.pipeline', 'p')
      .leftJoinAndSelect('p.pullRequest', 'pr')
      .leftJoinAndSelect('job.analysis', 'analysis')
      .orderBy('job.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Sync failed jobs for a pipeline
   */
  async syncFailedJobsForPipeline(pipelineId: string, jobsData: any[]): Promise<SyncResult> {
    const result: SyncResult = {
      created: 0,
      updated: 0,
      failed: 0,
    };

    for (const jobData of jobsData) {
      try {
        if (jobData.status !== 'failed' && jobData.status !== 'failure') {
          continue;
        }

        let job = await this.jobRepository.findOne({
          where: { id: jobData.id.toString() },
        });

        if (job) {
          // Update existing job
          job.status = JobStatus.FAILED;
          job.finishedAt = jobData.finished_at ? new Date(jobData.finished_at) : undefined;
          job.duration = jobData.duration;
          job.failureReason = jobData.failure_reason;

          await this.jobRepository.save(job);
          result.updated++;
        } else {
          // Create new job
          job = this.jobRepository.create({
            id: jobData.id.toString(),
            name: jobData.name,
            status: JobStatus.FAILED,
            stage: jobData.stage,
            startedAt: jobData.started_at ? new Date(jobData.started_at) : undefined,
            finishedAt: jobData.finished_at ? new Date(jobData.finished_at) : undefined,
            duration: jobData.duration,
            queueDuration: jobData.queue_duration,
            coverage: jobData.coverage,
            allowFailure: jobData.allow_failure || false,
            failureReason: jobData.failure_reason,
            retryCount: jobData.retry_count || 0,
            maxRetries: jobData.max_retries || 0,
            ref: jobData.ref,
            tag: jobData.tag,
            webUrl: jobData.web_url,
            artifacts: jobData.artifacts,
            runner: jobData.runner,
            pipeline: { id: pipelineId } as any,
            user: jobData.user,
            createdAt: jobData.created_at ? new Date(jobData.created_at) : new Date(),
            updatedAt: jobData.updated_at ? new Date(jobData.updated_at) : new Date(),
          });

          await this.jobRepository.save(job);
          result.created++;
        }
      } catch (error) {
        this.logger.error(`Failed to sync job ${jobData.id}:`, error);
        result.failed++;
      }
    }

    return result;
  }
}