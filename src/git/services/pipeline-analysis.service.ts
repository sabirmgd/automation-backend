import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PipelineAnalysis, PipelineFailureType, ConfidenceLevel } from '../entities/pipeline-analysis.entity';
import { PipelineAnalysisAgent } from '../../agents/pipelines/pipeline-analysis.agent';
import { PipelineAnalysisInput, PipelineAnalysisOutput } from '../../agents/pipelines/schemas/pipeline-analysis.schema';
import { formatPipelineAnalysisComment } from '../../agents/pipelines/helpers/comment-formatter.helper';
import { GitCredentialsService } from './git-credentials.service';
import { GitRepository, GitProvider } from '../entities/git-repository.entity';
import { GitHubPipelineManager } from '../../clients/pipeline-manager/github-pipeline.manager';
import { GitLabPipelineManager } from '../../clients/pipeline-manager/gitlab-pipeline.manager';

export interface AnalyzePipelineDto {
  platform: 'github' | 'gitlab';
  projectId: string;
  pipelineId: string;
  pipelineName?: string;
  mergeRequestId?: string;
  pullRequestId?: string;
  ref?: string;
  triggeredBy?: string;
  status: string;
}

export interface PipelineDataDto {
  failedJobsCount: number;
  totalJobsCount: number;
  config?: string;
  errorMessage?: string;
  failedJobs?: Array<{
    jobName: string;
    stage: string;
    failureReason?: string;
  }>;
  hasConfigError?: boolean;
}

@Injectable()
export class PipelineAnalysisService {
  private readonly logger = new Logger(PipelineAnalysisService.name);

  constructor(
    @InjectRepository(PipelineAnalysis)
    private pipelineAnalysisRepository: Repository<PipelineAnalysis>,
    @InjectRepository(GitRepository)
    private gitRepositoryRepository: Repository<GitRepository>,
    @Inject(forwardRef(() => GitCredentialsService))
    private credentialsService: GitCredentialsService,
    private pipelineAnalysisAgent: PipelineAnalysisAgent,
    private githubPipelineManager: GitHubPipelineManager,
    private gitlabPipelineManager: GitLabPipelineManager,
  ) {}

  /**
   * Get failed pipelines for a merge request or pull request
   */
  async getFailedPipelinesForMR(
    platform: 'github' | 'gitlab',
    projectId: string,
    mrId: string
  ): Promise<PipelineAnalysis[]> {
    const query = this.pipelineAnalysisRepository.createQueryBuilder('analysis');

    query.where('analysis.projectId = :projectId', { projectId });

    if (platform === 'gitlab') {
      query.andWhere('analysis.mergeRequestIid = :mrId', { mrId: parseInt(mrId) });
    } else {
      // For GitHub, use ref to match PR
      query.andWhere('analysis.ref LIKE :ref', { ref: `%pull/${mrId}/%` });
    }

    query.orderBy('analysis.analyzedAt', 'DESC');

    return query.getMany();
  }

  /**
   * Fetch pipeline data from GitHub/GitLab using credentials
   */
  private async fetchPipelineData(
    dto: AnalyzePipelineDto
  ): Promise<PipelineDataDto | null> {
    try {
      // Get repository from database
      const repository = await this.findRepository(dto.projectId, dto.platform);

      if (!repository || !repository.credentialId) {
        this.logger.warn(`No repository or credentials found for ${dto.projectId}`);
        return null;
      }

      // Get credentials
      const credential = await this.credentialsService.getDecryptedCredential(
        repository.credentialId
      );
      const token = credential.encryptedToken;

      // Get pipeline manager based on platform
      const pipelineManager = dto.platform === 'github'
        ? this.githubPipelineManager
        : this.gitlabPipelineManager;

      // Get repo identifier
      const repoIdentifier = this.getRepoIdentifier(repository);

      // Fetch pipeline details
      const pipelineDetails = await pipelineManager.getPipelineDetails(
        repoIdentifier,
        dto.pipelineId,
        token
      );

      // Get pipeline config
      let config: string | undefined;
      try {
        const pipelineConfig = await pipelineManager.getPipelineConfig(
          repoIdentifier,
          dto.pipelineId,
          token
        );
        config = pipelineConfig.content;
      } catch (error) {
        this.logger.warn(`Could not fetch pipeline config: ${error.message}`);
      }

      return {
        failedJobsCount: pipelineDetails.failedJobsCount || 0,
        totalJobsCount: pipelineDetails.jobsCount || 0,
        config,
        errorMessage: pipelineDetails.errorMessage,
        failedJobs: pipelineDetails.jobs
          ?.filter(job => job.status === 'failed' || job.conclusion === 'failure')
          .map(job => ({
            jobName: job.name,
            stage: job.stage || 'unknown',
            failureReason: job.conclusion || job.status,
          })),
        hasConfigError: pipelineDetails.status === 'config_error' ||
                       pipelineDetails.conclusion === 'startup_failure',
      };
    } catch (error) {
      this.logger.error(`Failed to fetch pipeline data: ${error.message}`);
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
   * Analyze a failed pipeline and save the results
   */
  async analyzePipeline(
    dto: AnalyzePipelineDto,
    dataDto?: PipelineDataDto
  ): Promise<PipelineAnalysis> {
    try {
      this.logger.log(
        `Analyzing pipeline ${dto.pipelineName || dto.pipelineId} for ${dto.platform}`
      );

      // Check if already analyzed
      const existingAnalysis = await this.findExistingAnalysis(dto);
      if (existingAnalysis) {
        this.logger.log(`Using cached analysis for pipeline ${dto.pipelineId}`);
        return existingAnalysis;
      }

      // If no data provided, try to fetch from API
      let pipelineData = dataDto;
      if (!pipelineData) {
        pipelineData = await this.fetchPipelineData(dto);
        if (!pipelineData) {
          throw new Error('Could not fetch pipeline data. Please provide data or ensure repository credentials are configured.');
        }
      }

      // Prepare input for the agent
      const input: PipelineAnalysisInput = {
        pipelineId: dto.pipelineId,
        pipelineName: dto.pipelineName,
        platform: dto.platform,
        projectId: dto.projectId,
        ref: dto.ref,
        triggeredBy: dto.triggeredBy,
        status: dto.status,
        failedJobsCount: pipelineData.failedJobsCount,
        totalJobsCount: pipelineData.totalJobsCount,
        config: pipelineData.config,
        errorMessage: pipelineData.errorMessage,
        failedJobs: pipelineData.failedJobs,
        hasConfigError: pipelineData.hasConfigError,
      };

      // Perform analysis
      const analysisOutput = await this.pipelineAnalysisAgent.analyzePipeline(input);

      // Create entity
      const analysisEntity = await this.createAnalysisEntity(
        dto,
        pipelineData,
        analysisOutput
      );

      // Save to database
      const savedAnalysis = await this.pipelineAnalysisRepository.save(analysisEntity);

      this.logger.log(
        `Analysis saved for pipeline ${dto.pipelineId}: ${analysisOutput.failureType}`
      );

      return savedAnalysis;
    } catch (error) {
      this.logger.error(
        `Failed to analyze pipeline ${dto.pipelineId}`,
        error instanceof Error ? error.stack : String(error)
      );
      throw error;
    }
  }

  /**
   * Analyze and post comment to MR/PR
   */
  async analyzeAndComment(
    dto: AnalyzePipelineDto,
    dataDto: PipelineDataDto,
    pipelineUrl?: string
  ): Promise<{ analysis: PipelineAnalysis; comment: string }> {
    // Perform analysis
    const analysis = await this.analyzePipeline(dto, dataDto);

    // Format comment
    const comment = formatPipelineAnalysisComment(
      this.convertToAnalysisOutput(analysis),
      analysis.pipelineName || analysis.pipelineId,
      pipelineUrl,
      dto.platform
    );

    // Note: Actual posting to GitLab/GitHub would be handled by the client layer
    // This service just returns the formatted comment

    return { analysis, comment };
  }

  /**
   * Get pipeline analysis statistics for a project
   */
  async getProjectStatistics(projectId: string): Promise<{
    totalAnalyses: number;
    failureTypeBreakdown: Record<string, number>;
    averageFailedJobs: number;
    mostCommonFailures: Array<{ type: string; count: number }>;
    configErrorRate: number;
  }> {
    const analyses = await this.pipelineAnalysisRepository.find({
      where: { projectId },
    });

    const failureTypeBreakdown: Record<string, number> = {};
    let totalFailedJobs = 0;
    let configErrors = 0;

    analyses.forEach(analysis => {
      // Count failure types
      failureTypeBreakdown[analysis.failureType] =
        (failureTypeBreakdown[analysis.failureType] || 0) + 1;

      // Sum failed jobs
      totalFailedJobs += analysis.failedJobsCount;

      // Count config errors
      if (analysis.failureType === PipelineFailureType.YAML_SYNTAX_ERROR ||
          analysis.failureType === PipelineFailureType.INVALID_CONFIGURATION) {
        configErrors++;
      }
    });

    // Get most common failures
    const mostCommonFailures = Object.entries(failureTypeBreakdown)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalAnalyses: analyses.length,
      failureTypeBreakdown,
      averageFailedJobs: analyses.length > 0 ? totalFailedJobs / analyses.length : 0,
      mostCommonFailures,
      configErrorRate: analyses.length > 0 ? (configErrors / analyses.length) * 100 : 0,
    };
  }

  /**
   * Get pipelines with multiple job failures
   */
  async getPipelinesWithMultipleFailures(
    projectId: string,
    minFailedJobs: number = 2
  ): Promise<PipelineAnalysis[]> {
    return this.pipelineAnalysisRepository
      .createQueryBuilder('analysis')
      .where('analysis.projectId = :projectId', { projectId })
      .andWhere('analysis.failedJobsCount >= :minFailedJobs', { minFailedJobs })
      .orderBy('analysis.failedJobsCount', 'DESC')
      .getMany();
  }

  /**
   * Batch analyze multiple pipelines
   */
  async batchAnalyzePipelines(
    pipelines: Array<{ dto: AnalyzePipelineDto; dataDto: PipelineDataDto }>
  ): Promise<PipelineAnalysis[]> {
    const results: PipelineAnalysis[] = [];

    for (const pipeline of pipelines) {
      try {
        const analysis = await this.analyzePipeline(pipeline.dto, pipeline.dataDto);
        results.push(analysis);
      } catch (error) {
        this.logger.error(
          `Failed to analyze pipeline ${pipeline.dto.pipelineId} in batch`,
          error
        );
        // Continue with other pipelines even if one fails
      }
    }

    return results;
  }

  private async findExistingAnalysis(dto: AnalyzePipelineDto): Promise<PipelineAnalysis | null> {
    return this.pipelineAnalysisRepository.findOne({
      where: {
        projectId: dto.projectId,
        pipelineId: dto.pipelineId,
      },
    });
  }

  private async createAnalysisEntity(
    dto: AnalyzePipelineDto,
    dataDto: PipelineDataDto,
    output: PipelineAnalysisOutput
  ): Promise<PipelineAnalysis> {
    const entity = new PipelineAnalysis();

    entity.pipelineId = dto.pipelineId;
    entity.pipelineName = dto.pipelineName;
    entity.projectId = dto.projectId;
    entity.mergeRequestIid = dto.mergeRequestId ? parseInt(dto.mergeRequestId) : undefined;
    entity.ref = dto.ref;
    entity.triggeredBy = dto.triggeredBy;
    entity.pipelineStatus = dto.status;
    entity.failedJobsCount = dataDto.failedJobsCount;
    entity.totalJobsCount = dataDto.totalJobsCount;
    entity.failureType = output.failureType as PipelineFailureType;
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
    entity.failedJobNames = output.failedJobNames;
    entity.failedJobStages = output.failedJobStages;
    entity.analyzedAt = new Date();
    entity.createdAt = new Date();
    entity.updatedAt = new Date();

    return entity;
  }

  private convertToAnalysisOutput(analysis: PipelineAnalysis): PipelineAnalysisOutput {
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
      failedJobNames: analysis.failedJobNames,
      failedJobStages: analysis.failedJobStages,
    };
  }
}