import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobAnalysis, JobFailureType, ConfidenceLevel } from '../entities/job-analysis.entity';
import { JobAnalysisAgent } from '../../agents/jobs/job-analysis.agent';
import { JobAnalysisInput, JobAnalysisOutput } from '../../agents/jobs/schemas/job-analysis.schema';
import { formatJobAnalysisComment } from '../../agents/jobs/helpers/comment-formatter.helper';
import { GitCredentialsService } from './git-credentials.service';
import { GitRepository, GitProvider } from '../entities/git-repository.entity';
import { GitHubJobManager } from '../../clients/job-manager/github-job.manager';
import { GitLabJobManager } from '../../clients/job-manager/gitlab-job.manager';

export interface AnalyzeJobDto {
  platform: 'github' | 'gitlab';
  projectId: string;
  jobId: string;
  jobName: string;
  stage: string;
  pipelineId: string;
  mergeRequestId?: string;
  pullRequestId?: string;
  ref?: string;
  triggeredBy?: string;
}

export interface JobLogsDto {
  logs: string;
  config?: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  duration?: number;
  runner?: string;
  allowFailure?: boolean;
}

@Injectable()
export class JobAnalysisService {
  private readonly logger = new Logger(JobAnalysisService.name);

  // Cache for repository and credential data to avoid redundant DB queries
  private repositoryCache = new Map<string, { repository: GitRepository; token: string; expiresAt: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    @InjectRepository(JobAnalysis)
    private jobAnalysisRepository: Repository<JobAnalysis>,
    @InjectRepository(GitRepository)
    private gitRepositoryRepository: Repository<GitRepository>,
    @Inject(forwardRef(() => GitCredentialsService))
    private credentialsService: GitCredentialsService,
    private jobAnalysisAgent: JobAnalysisAgent,
    private githubJobManager: GitHubJobManager,
    private gitlabJobManager: GitLabJobManager,
  ) {}

  /**
   * Get failed jobs for a merge request or pull request
   */
  async getFailedJobsForMR(
    platform: 'github' | 'gitlab',
    projectId: string,
    mrId: string
  ): Promise<JobAnalysis[]> {
    const query = this.jobAnalysisRepository.createQueryBuilder('analysis');

    query.where('analysis.projectId = :projectId', { projectId });

    if (platform === 'gitlab') {
      query.andWhere('analysis.mergeRequestIid = :mrId', { mrId: parseInt(mrId) });
    } else {
      // For GitHub, store PR number in a different field or use ref
      query.andWhere('analysis.ref LIKE :ref', { ref: `%pull/${mrId}/%` });
    }

    query.orderBy('analysis.analyzedAt', 'DESC');

    return query.getMany();
  }

  /**
   * Get repository and token from cache or database
   */
  private async getRepositoryWithToken(
    projectId: string,
    platform: 'github' | 'gitlab'
  ): Promise<{ repository: GitRepository; token: string } | null> {
    const cacheKey = `${platform}:${projectId}`;
    const now = Date.now();

    // Check cache first
    const cached = this.repositoryCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      this.logger.debug(`Using cached repository data for ${cacheKey}`);
      return { repository: cached.repository, token: cached.token };
    }

    // Cache miss or expired - fetch from database
    const repository = await this.findRepository(projectId, platform);

    if (!repository || !repository.credentialId) {
      this.logger.warn(`No repository or credentials found for ${projectId}`);
      return null;
    }

    // Get credentials
    const credential = await this.credentialsService.getDecryptedCredential(
      repository.credentialId
    );
    const token = credential.encryptedToken;

    // Cache for future use
    this.repositoryCache.set(cacheKey, {
      repository,
      token,
      expiresAt: now + this.CACHE_TTL,
    });

    this.logger.debug(`Cached repository data for ${cacheKey} (TTL: ${this.CACHE_TTL}ms)`);

    return { repository, token };
  }

  /**
   * Fetch job data from GitHub/GitLab using credentials
   */
  private async fetchJobData(
    dto: AnalyzeJobDto
  ): Promise<JobLogsDto | null> {
    try {
      // Get repository and token (from cache or DB)
      const repoData = await this.getRepositoryWithToken(dto.projectId, dto.platform);

      if (!repoData) {
        return null;
      }

      const { repository, token } = repoData;

      // Get job manager based on platform
      const jobManager = dto.platform === 'github'
        ? this.githubJobManager
        : this.gitlabJobManager;

      // Get repo identifier
      const repoIdentifier = this.getRepoIdentifier(repository);

      // Fetch job details with logs
      const jobDetails = await jobManager.getJobWithDetails(
        repoIdentifier,
        dto.jobId,
        token
      );

      return {
        logs: jobDetails.logs?.content || '',
        config: jobDetails.config ? JSON.stringify(jobDetails.config) : undefined,
        status: jobDetails.status,
        startedAt: jobDetails.startedAt,
        finishedAt: jobDetails.completedAt,
        duration: jobDetails.duration,
        runner: jobDetails.runner,
        allowFailure: jobDetails.allowFailure,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch job data: ${error.message}`);
      return null;
    }
  }

  private async findRepository(
    projectId: string,
    platform: 'github' | 'gitlab'
  ): Promise<GitRepository | null> {
    if (platform === 'github') {
      const [namespace, name] = projectId.split('/');
      if (namespace && name) {
        return await this.gitRepositoryRepository.findOne({
          where: {
            namespace,
            name,
            provider: GitProvider.GITHUB,
          },
        });
      }
    } else {
      // For GitLab, try remoteId first
      let repository = await this.gitRepositoryRepository.findOne({
        where: {
          remoteId: projectId,
          provider: GitProvider.GITLAB,
        },
      });

      if (!repository) {
        // Try by namespace/name
        const [namespace, name] = projectId.split('/');
        if (namespace && name) {
          repository = await this.gitRepositoryRepository.findOne({
            where: {
              namespace,
              name,
              provider: GitProvider.GITLAB,
            },
          });
        }
      }

      return repository;
    }

    return null;
  }

  private getRepoIdentifier(repository: GitRepository): string {
    if (repository.provider === GitProvider.GITHUB) {
      return `${repository.namespace}/${repository.name}`;
    } else {
      return repository.remoteId || `${repository.namespace}/${repository.name}`;
    }
  }

  /**
   * Analyze a failed job and save the results
   */
  async analyzeJob(
    dto: AnalyzeJobDto,
    logsDto?: JobLogsDto
  ): Promise<JobAnalysis> {
    try {
      this.logger.log(
        `Analyzing job ${dto.jobName} (${dto.jobId}) for ${dto.platform}`
      );

      // Check if already analyzed
      const existingAnalysis = await this.findExistingAnalysis(dto);
      if (existingAnalysis) {
        this.logger.log(`Using cached analysis for job ${dto.jobName}`);
        return existingAnalysis;
      }

      // If no logs provided, try to fetch from API
      let jobData = logsDto;
      if (!jobData) {
        jobData = await this.fetchJobData(dto);
        if (!jobData) {
          throw new Error('Could not fetch job data. Please provide data or ensure repository credentials are configured.');
        }
      }

      // Prepare input for the agent
      const input: JobAnalysisInput = {
        jobId: dto.jobId,
        jobName: dto.jobName,
        stage: dto.stage,
        status: jobData.status,
        platform: dto.platform,
        projectId: dto.projectId,
        pipelineId: dto.pipelineId,
        ref: dto.ref,
        triggeredBy: dto.triggeredBy,
        startedAt: jobData.startedAt,
        finishedAt: jobData.finishedAt,
        duration: jobData.duration,
        runner: jobData.runner,
        logs: jobData.logs,
        config: jobData.config,
        allowFailure: jobData.allowFailure,
      };

      // Perform analysis
      const analysisOutput = await this.jobAnalysisAgent.analyzeJob(input);

      // Create entity
      const analysisEntity = await this.createAnalysisEntity(
        dto,
        analysisOutput
      );

      // Save to database
      const savedAnalysis = await this.jobAnalysisRepository.save(analysisEntity);

      this.logger.log(
        `Analysis saved for job ${dto.jobName}: ${analysisOutput.failureType}`
      );

      return savedAnalysis;
    } catch (error) {
      this.logger.error(
        `Failed to analyze job ${dto.jobName}`,
        error instanceof Error ? error.stack : String(error)
      );
      throw error;
    }
  }

  /**
   * Analyze and post comment to MR/PR
   */
  async analyzeAndComment(
    dto: AnalyzeJobDto,
    logsDto: JobLogsDto,
    jobUrl?: string
  ): Promise<{ analysis: JobAnalysis; comment: string }> {
    // Perform analysis
    const analysis = await this.analyzeJob(dto, logsDto);

    // Format comment
    const comment = formatJobAnalysisComment(
      this.convertToAnalysisOutput(analysis),
      analysis.jobName,
      jobUrl
    );

    // Note: Actual posting to GitLab/GitHub would be handled by the client layer
    // This service just returns the formatted comment

    return { analysis, comment };
  }

  /**
   * Get analysis statistics for a project
   */
  async getProjectStatistics(projectId: string): Promise<{
    totalAnalyses: number;
    failureTypeBreakdown: Record<string, number>;
    confidenceBreakdown: Record<string, number>;
    mostCommonFailures: Array<{ type: string; count: number }>;
  }> {
    const analyses = await this.jobAnalysisRepository.find({
      where: { projectId },
    });

    const failureTypeBreakdown: Record<string, number> = {};
    const confidenceBreakdown: Record<string, number> = {};

    analyses.forEach(analysis => {
      // Count failure types
      failureTypeBreakdown[analysis.failureType] =
        (failureTypeBreakdown[analysis.failureType] || 0) + 1;

      // Count confidence levels
      confidenceBreakdown[analysis.confidence] =
        (confidenceBreakdown[analysis.confidence] || 0) + 1;
    });

    // Get most common failures
    const mostCommonFailures = Object.entries(failureTypeBreakdown)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalAnalyses: analyses.length,
      failureTypeBreakdown,
      confidenceBreakdown,
      mostCommonFailures,
    };
  }

  /**
   * Batch analyze multiple jobs
   */
  async batchAnalyzeJobs(
    jobs: Array<{ dto: AnalyzeJobDto; logsDto: JobLogsDto }>
  ): Promise<JobAnalysis[]> {
    const results: JobAnalysis[] = [];

    for (const job of jobs) {
      try {
        const analysis = await this.analyzeJob(job.dto, job.logsDto);
        results.push(analysis);
      } catch (error) {
        this.logger.error(
          `Failed to analyze job ${job.dto.jobName} in batch`,
          error
        );
        // Continue with other jobs even if one fails
      }
    }

    return results;
  }

  private async findExistingAnalysis(dto: AnalyzeJobDto): Promise<JobAnalysis | null> {
    return this.jobAnalysisRepository.findOne({
      where: {
        projectId: dto.projectId,
        jobId: dto.jobId,
        jobName: dto.jobName,
      },
    });
  }

  private async createAnalysisEntity(
    dto: AnalyzeJobDto,
    output: JobAnalysisOutput
  ): Promise<JobAnalysis> {
    const entity = new JobAnalysis();

    entity.jobId = dto.jobId;
    entity.jobName = dto.jobName;
    entity.stage = dto.stage;
    entity.projectId = dto.projectId;
    entity.pipelineId = dto.pipelineId;
    entity.mergeRequestIid = dto.mergeRequestId ? parseInt(dto.mergeRequestId) : undefined;
    entity.ref = dto.ref;
    entity.triggeredBy = dto.triggeredBy;
    entity.failureType = output.failureType as JobFailureType;
    entity.rootCause = output.rootCause;
    entity.affectedComponent = output.affectedComponent;
    entity.errorDetails = output.errorDetails;
    entity.suggestedFixSteps = output.suggestedFixSteps;
    entity.suggestedFixCommands = output.suggestedFixCommands;
    entity.preventionTips = output.preventionTips;
    entity.confidence = output.confidence as ConfidenceLevel;
    entity.additionalContext = output.additionalContext;
    entity.relatedFiles = output.relatedFiles;
    entity.estimatedFixTime = output.estimatedFixTime;
    entity.analyzedAt = new Date();
    entity.createdAt = new Date();
    entity.updatedAt = new Date();

    return entity;
  }

  private convertToAnalysisOutput(analysis: JobAnalysis): JobAnalysisOutput {
    return {
      failureType: analysis.failureType,
      rootCause: analysis.rootCause,
      affectedComponent: analysis.affectedComponent,
      errorDetails: analysis.errorDetails,
      suggestedFixSteps: analysis.suggestedFixSteps,
      suggestedFixCommands: analysis.suggestedFixCommands,
      preventionTips: analysis.preventionTips,
      confidence: analysis.confidence,
      additionalContext: analysis.additionalContext,
      relatedFiles: analysis.relatedFiles,
      estimatedFixTime: analysis.estimatedFixTime,
    };
  }
}