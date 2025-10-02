import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { PipelineService } from '../services/pipeline.service';

@Controller('api/pipelines')
@ApiTags('Pipelines')
export class PipelineController {
  private readonly logger = new Logger(PipelineController.name);

  constructor(private readonly pipelineService: PipelineService) {}

  /**
   * Sync failed pipelines from open PRs for a repository
   */
  @Post('sync/:repositoryId')
  @ApiOperation({ summary: 'Sync failed pipelines from open PRs' })
  @ApiParam({ name: 'repositoryId', description: 'Repository ID' })
  async syncFailedPipelines(
    @Param('repositoryId') repositoryId: string,
  ): Promise<any> {
    try {
      this.logger.log(`Starting pipeline sync for repository ${repositoryId}`);
      const result = await this.pipelineService.syncFailedPipelinesFromOpenPRs(repositoryId);
      return {
        success: true,
        message: 'Pipeline sync completed',
        ...result,
      };
    } catch (error) {
      this.logger.error('Failed to sync pipelines:', error);
      throw new HttpException(
        `Failed to sync pipelines: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get all failed pipelines from open PRs
   */
  @Get('failed/open-prs')
  @ApiOperation({ summary: 'Get failed pipelines from open PRs' })
  @ApiQuery({ name: 'repositoryId', required: false, description: 'Filter by repository' })
  async getFailedPipelinesFromOpenPRs(
    @Query('repositoryId') repositoryId?: string,
  ): Promise<any> {
    try {
      const pipelines = await this.pipelineService.getFailedPipelinesFromOpenPRs(repositoryId);

      // Group pipelines by PR for better organization
      const groupedByPR = pipelines.reduce((acc, pipeline) => {
        const prId = pipeline.pullRequest?.id || 'no-pr';
        if (!acc[prId]) {
          acc[prId] = {
            pullRequest: pipeline.pullRequest,
            pipelines: [],
          };
        }
        acc[prId].pipelines.push({
          id: pipeline.id,
          iid: pipeline.iid,
          sha: pipeline.sha,
          ref: pipeline.ref,
          status: pipeline.status,
          webUrl: pipeline.webUrl,
          createdAt: pipeline.createdAt,
          failedJobsCount: pipeline.jobs?.filter(j => j.status === 'failed').length || 0,
          hasAnalysis: !!pipeline.analysis,
          analysisId: pipeline.analysis?.id,
        });
        return acc;
      }, {} as any);

      return {
        totalPipelines: pipelines.length,
        pullRequestsCount: Object.keys(groupedByPR).length,
        data: Object.values(groupedByPR),
      };
    } catch (error) {
      this.logger.error('Failed to get failed pipelines:', error);
      throw new HttpException(
        `Failed to get failed pipelines: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get all failed jobs from open PRs
   */
  @Get('failed-jobs/open-prs')
  @ApiOperation({ summary: 'Get failed jobs from open PRs' })
  @ApiQuery({ name: 'repositoryId', required: false, description: 'Filter by repository' })
  async getFailedJobsFromOpenPRs(
    @Query('repositoryId') repositoryId?: string,
  ): Promise<any> {
    try {
      const jobs = await this.pipelineService.getFailedJobsFromOpenPRs(repositoryId);

      // Group jobs by pipeline for better organization
      const groupedByPipeline = jobs.reduce((acc, job) => {
        const pipelineId = job.pipeline?.id || 'no-pipeline';
        if (!acc[pipelineId]) {
          acc[pipelineId] = {
            pipeline: {
              id: job.pipeline?.id,
              iid: job.pipeline?.iid,
              ref: job.pipeline?.ref,
              pullRequest: job.pipeline?.pullRequest,
            },
            jobs: [],
          };
        }
        acc[pipelineId].jobs.push({
          id: job.id,
          name: job.name,
          stage: job.stage,
          status: job.status,
          failureReason: job.failureReason,
          webUrl: job.webUrl,
          duration: job.duration,
          hasAnalysis: !!job.analysis,
          analysisId: job.analysis?.id,
        });
        return acc;
      }, {} as any);

      return {
        totalJobs: jobs.length,
        pipelinesCount: Object.keys(groupedByPipeline).length,
        data: Object.values(groupedByPipeline),
      };
    } catch (error) {
      this.logger.error('Failed to get failed jobs:', error);
      throw new HttpException(
        `Failed to get failed jobs: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Sync jobs for a specific pipeline
   */
  @Post('sync-jobs/:pipelineId')
  @ApiOperation({ summary: 'Sync jobs for a specific pipeline' })
  @ApiParam({ name: 'pipelineId', description: 'Pipeline ID' })
  async syncJobsForPipeline(
    @Param('pipelineId') pipelineId: string,
  ): Promise<any> {
    try {
      // This would need to fetch jobs from GitHub/GitLab
      // For now, returning a placeholder
      return {
        success: true,
        message: 'Job sync not yet implemented',
        pipelineId,
      };
    } catch (error) {
      this.logger.error('Failed to sync jobs:', error);
      throw new HttpException(
        `Failed to sync jobs: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}