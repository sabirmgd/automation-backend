import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  HttpException,
  HttpStatus,
  Logger,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { JobAnalysisService } from '../services/job-analysis.service';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';

@Controller('api/job-analysis')
@ApiTags('Job Analysis')
export class JobAnalysisController {
  private readonly logger = new Logger(JobAnalysisController.name);

  constructor(private readonly jobAnalysisService: JobAnalysisService) {}

  /**
   * Analyze a specific failed job
   */
  @Post('analyze/:platform/:projectId/:jobId')
  @ApiOperation({ summary: 'Analyze a failed CI/CD job' })
  @ApiParam({ name: 'platform', enum: ['github', 'gitlab'] })
  @ApiParam({ name: 'projectId', description: 'Project or Repository ID' })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiQuery({ name: 'mrIid', required: false, description: 'MR/PR ID to post comment' })
  async analyzeJob(
    @Param('platform') platform: 'github' | 'gitlab',
    @Param('projectId') projectId: string,
    @Param('jobId') jobId: string,
    @Query('mrIid') mrIid?: string,
    @Body() body?: { pipelineId?: string; [key: string]: any },
  ): Promise<any> {
    try {
      // Extract data from body (pipelineId is the most important)
      const pipelineId = body?.pipelineId || 'unknown';

      const dto = {
        platform,
        projectId,
        jobId,
        jobName: body?.jobName || 'Unknown Job',
        stage: body?.stage || 'unknown',
        pipelineId,
        mergeRequestId: platform === 'gitlab' ? mrIid : undefined,
        pullRequestId: platform === 'github' ? mrIid : undefined,
        ref: body?.ref,
        triggeredBy: body?.triggeredBy,
      };

      const logsDto = {
        logs: body?.logs || '',
        config: body?.config,
        status: body?.status || 'failed',
        startedAt: body?.startedAt,
        finishedAt: body?.finishedAt,
        duration: body?.duration,
        runner: body?.runner,
        allowFailure: body?.allowFailure,
      };

      const result = await this.jobAnalysisService.analyzeJob(dto, logsDto);

      if (mrIid) {
        const { comment } = await this.jobAnalysisService.analyzeAndComment(
          dto,
          logsDto,
          body?.jobUrl,
        );

        return {
          analysis: result,
          postedToMR: true,
          mrIid,
          comment,
          message: `Analysis posted to ${platform === 'gitlab' ? 'MR' : 'PR'} #${mrIid}`,
        };
      }

      return {
        analysis: result,
        postedToMR: false,
        message: `Analysis completed (use ?mrIid=X to post to ${platform === 'gitlab' ? 'MR' : 'PR'})`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to analyze job ${jobId} in project ${projectId}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        `Failed to analyze job: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get failed jobs for a merge request or pull request
   */
  @Get('failed-jobs/:platform/:projectId/:mrId')
  @ApiOperation({ summary: 'Get failed jobs for a MR/PR' })
  @ApiParam({ name: 'platform', enum: ['github', 'gitlab'] })
  async getFailedJobsForMR(
    @Param('platform') platform: 'github' | 'gitlab',
    @Param('projectId') projectId: string,
    @Param('mrId') mrId: string,
  ): Promise<any> {
    try {
      const analyses = await this.jobAnalysisService.getFailedJobsForMR(
        platform,
        projectId,
        mrId,
      );

      return {
        platform,
        projectId,
        mrId,
        count: analyses.length,
        analyses,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get failed jobs for MR ${mrId}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw new HttpException(
        `Failed to get failed jobs: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Batch analyze multiple jobs
   */
  @Post('batch-analyze/:platform')
  @ApiOperation({ summary: 'Analyze multiple failed jobs' })
  @ApiParam({ name: 'platform', enum: ['github', 'gitlab'] })
  async batchAnalyzeJobs(
    @Param('platform') platform: 'github' | 'gitlab',
    @Body() jobs: Array<{
      projectId: string;
      jobId: string;
      jobName: string;
      stage: string;
      pipelineId: string;
      logs: string;
      config?: string;
      status?: string;
    }>,
  ): Promise<any> {
    try {
      const jobsToAnalyze = jobs.map(job => ({
        dto: {
          platform,
          projectId: job.projectId,
          jobId: job.jobId,
          jobName: job.jobName,
          stage: job.stage,
          pipelineId: job.pipelineId,
        },
        logsDto: {
          logs: job.logs,
          config: job.config,
          status: job.status || 'failed',
        },
      }));

      const results = await this.jobAnalysisService.batchAnalyzeJobs(jobsToAnalyze);

      return {
        platform,
        totalJobs: jobs.length,
        analyzedCount: results.length,
        analyses: results,
      };
    } catch (error) {
      this.logger.error(
        'Failed to batch analyze jobs',
        error instanceof Error ? error.stack : String(error),
      );

      throw new HttpException(
        `Failed to batch analyze jobs: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get project statistics
   */
  @Get('statistics/:projectId')
  @ApiOperation({ summary: 'Get job analysis statistics for a project' })
  async getProjectStatistics(
    @Param('projectId') projectId: string,
  ): Promise<any> {
    try {
      return await this.jobAnalysisService.getProjectStatistics(projectId);
    } catch (error) {
      this.logger.error(
        `Failed to get statistics for project ${projectId}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw new HttpException(
        `Failed to get statistics: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Handle webhook for job failures (GitLab/GitHub)
   */
  @Post('webhook/:platform')
  @ApiOperation({ summary: 'Handle CI/CD job failure webhook' })
  @ApiParam({ name: 'platform', enum: ['github', 'gitlab'] })
  async handleJobWebhook(
    @Param('platform') platform: 'github' | 'gitlab',
    @Body() webhookData: any,
    @Headers() headers: Record<string, string>,
  ): Promise<any> {
    try {
      // Platform-specific webhook handling
      if (platform === 'gitlab') {
        return this.handleGitLabWebhook(webhookData, headers);
      } else {
        return this.handleGitHubWebhook(webhookData, headers);
      }
    } catch (error) {
      this.logger.error(
        'Failed to handle job webhook',
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to process webhook',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async handleGitLabWebhook(webhookData: any, headers: Record<string, string>) {
    // Validate it's a job event
    if (webhookData.object_kind !== 'build') {
      return { status: 'skipped', reason: 'Not a job event' };
    }

    // Check if job failed
    if (webhookData.build_status !== 'failed') {
      return { status: 'skipped', reason: 'Job did not fail' };
    }

    // Skip jobs that are allowed to fail
    if (webhookData.build_allow_failure === true) {
      return {
        status: 'skipped',
        reason: 'Job is allowed to fail (allow_failure: true)',
      };
    }

    // Extract MR IID if present
    const ref = webhookData.ref;
    const mrMatch = ref?.match(/refs\/merge-requests\/(\d+)\/(?:head|merge)/);
    const mrIid = mrMatch ? mrMatch[1] : undefined;

    // Queue for async processing (would integrate with queue service)
    this.logger.log(
      `Received GitLab job failure webhook for project ${webhookData.project_id}, job ${webhookData.build_id}`,
    );

    return {
      status: 'accepted',
      message: 'Job failure analysis queued',
      jobId: webhookData.build_id,
      mrIid,
    };
  }

  private async handleGitHubWebhook(webhookData: any, headers: Record<string, string>) {
    // Handle GitHub Actions webhook
    const eventType = headers['x-github-event'];

    if (eventType !== 'workflow_run' && eventType !== 'check_run') {
      return { status: 'skipped', reason: 'Not a job event' };
    }

    // Check if job/workflow failed
    const status = webhookData.workflow_run?.conclusion || webhookData.check_run?.conclusion;
    if (status !== 'failure') {
      return { status: 'skipped', reason: 'Job did not fail' };
    }

    // Extract PR number if present
    const prNumber = webhookData.workflow_run?.pull_requests?.[0]?.number ||
                     webhookData.check_run?.pull_requests?.[0]?.number;

    this.logger.log(
      `Received GitHub job failure webhook for repository ${webhookData.repository?.full_name}`,
    );

    return {
      status: 'accepted',
      message: 'Job failure analysis queued',
      jobId: webhookData.workflow_run?.id || webhookData.check_run?.id,
      prNumber,
    };
  }

  /**
   * Health check endpoint
   */
  @Get('health')
  async health(): Promise<any> {
    return {
      status: 'healthy',
      service: 'job-analysis',
      timestamp: new Date().toISOString(),
    };
  }
}