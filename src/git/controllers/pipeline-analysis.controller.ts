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
  Headers,
} from '@nestjs/common';
import { PipelineAnalysisService } from '../services/pipeline-analysis.service';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';

@Controller('api/pipeline-analysis')
@ApiTags('Pipeline Analysis')
export class PipelineAnalysisController {
  private readonly logger = new Logger(PipelineAnalysisController.name);

  constructor(private readonly pipelineAnalysisService: PipelineAnalysisService) {}

  /**
   * Analyze an entire pipeline
   */
  @Post('analyze/:platform/:projectId/:pipelineId')
  @ApiOperation({ summary: 'Analyze a failed CI/CD pipeline' })
  @ApiParam({ name: 'platform', enum: ['github', 'gitlab'] })
  @ApiParam({ name: 'projectId', description: 'Project or Repository ID' })
  @ApiParam({ name: 'pipelineId', description: 'Pipeline/Workflow ID' })
  @ApiQuery({ name: 'mrIid', required: false, description: 'MR/PR ID to post comment' })
  async analyzePipeline(
    @Param('platform') platform: 'github' | 'gitlab',
    @Param('projectId') projectId: string,
    @Param('pipelineId') pipelineId: string,
    @Query('mrIid') mrIid?: string,
    @Body() pipelineData?: any,
  ): Promise<any> {
    try {
      const dto = {
        platform,
        projectId,
        pipelineId,
        pipelineName: pipelineData?.pipelineName,
        mergeRequestId: platform === 'gitlab' ? mrIid : undefined,
        pullRequestId: platform === 'github' ? mrIid : undefined,
        ref: pipelineData?.ref,
        triggeredBy: pipelineData?.triggeredBy,
        status: pipelineData?.status || 'failed',
      };

      const dataDto = {
        failedJobsCount: pipelineData?.failedJobsCount || 0,
        totalJobsCount: pipelineData?.totalJobsCount || 0,
        config: pipelineData?.config,
        errorMessage: pipelineData?.errorMessage,
        failedJobs: pipelineData?.failedJobs,
        hasConfigError: pipelineData?.hasConfigError,
      };

      const result = await this.pipelineAnalysisService.analyzePipeline(dto, dataDto);

      if (mrIid) {
        const { comment } = await this.pipelineAnalysisService.analyzeAndComment(
          dto,
          dataDto,
          pipelineData?.pipelineUrl,
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
        `Failed to analyze pipeline ${pipelineId} in project ${projectId}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        `Failed to analyze pipeline: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get failed pipelines for a merge request or pull request
   */
  @Get('failed-pipelines/:platform/:projectId/:mrId')
  @ApiOperation({ summary: 'Get failed pipelines for a MR/PR' })
  @ApiParam({ name: 'platform', enum: ['github', 'gitlab'] })
  async getFailedPipelinesForMR(
    @Param('platform') platform: 'github' | 'gitlab',
    @Param('projectId') projectId: string,
    @Param('mrId') mrId: string,
  ): Promise<any> {
    try {
      const analyses = await this.pipelineAnalysisService.getFailedPipelinesForMR(
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
        `Failed to get failed pipelines for MR ${mrId}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw new HttpException(
        `Failed to get failed pipelines: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get pipelines with multiple job failures
   */
  @Get('multiple-failures/:projectId')
  @ApiOperation({ summary: 'Get pipelines with multiple job failures' })
  @ApiQuery({ name: 'minFailedJobs', required: false, description: 'Minimum failed jobs' })
  async getPipelinesWithMultipleFailures(
    @Param('projectId') projectId: string,
    @Query('minFailedJobs') minFailedJobs?: string,
  ): Promise<any> {
    try {
      const minJobs = minFailedJobs ? parseInt(minFailedJobs, 10) : 2;

      const pipelines = await this.pipelineAnalysisService.getPipelinesWithMultipleFailures(
        projectId,
        minJobs,
      );

      return {
        projectId,
        minFailedJobs: minJobs,
        count: pipelines.length,
        pipelines,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get pipelines with multiple failures for project ${projectId}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw new HttpException(
        `Failed to get pipelines: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Batch analyze multiple pipelines
   */
  @Post('batch-analyze/:platform')
  @ApiOperation({ summary: 'Analyze multiple failed pipelines' })
  @ApiParam({ name: 'platform', enum: ['github', 'gitlab'] })
  async batchAnalyzePipelines(
    @Param('platform') platform: 'github' | 'gitlab',
    @Body() pipelines: Array<{
      projectId: string;
      pipelineId: string;
      pipelineName?: string;
      status: string;
      failedJobsCount: number;
      totalJobsCount: number;
      config?: string;
      errorMessage?: string;
      failedJobs?: Array<{
        jobName: string;
        stage: string;
        failureReason?: string;
      }>;
    }>,
  ): Promise<any> {
    try {
      const pipelinesToAnalyze = pipelines.map(pipeline => ({
        dto: {
          platform,
          projectId: pipeline.projectId,
          pipelineId: pipeline.pipelineId,
          pipelineName: pipeline.pipelineName,
          status: pipeline.status,
        },
        dataDto: {
          failedJobsCount: pipeline.failedJobsCount,
          totalJobsCount: pipeline.totalJobsCount,
          config: pipeline.config,
          errorMessage: pipeline.errorMessage,
          failedJobs: pipeline.failedJobs,
        },
      }));

      const results = await this.pipelineAnalysisService.batchAnalyzePipelines(
        pipelinesToAnalyze,
      );

      return {
        platform,
        totalPipelines: pipelines.length,
        analyzedCount: results.length,
        analyses: results,
      };
    } catch (error) {
      this.logger.error(
        'Failed to batch analyze pipelines',
        error instanceof Error ? error.stack : String(error),
      );

      throw new HttpException(
        `Failed to batch analyze pipelines: ${
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
  @ApiOperation({ summary: 'Get pipeline analysis statistics for a project' })
  async getProjectStatistics(
    @Param('projectId') projectId: string,
  ): Promise<any> {
    try {
      return await this.pipelineAnalysisService.getProjectStatistics(projectId);
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
   * Handle webhook for pipeline failures
   */
  @Post('webhook/:platform')
  @ApiOperation({ summary: 'Handle CI/CD pipeline failure webhook' })
  @ApiParam({ name: 'platform', enum: ['github', 'gitlab'] })
  async handlePipelineWebhook(
    @Param('platform') platform: 'github' | 'gitlab',
    @Body() webhookData: any,
    @Headers() headers: Record<string, string>,
  ): Promise<any> {
    try {
      if (platform === 'gitlab') {
        return this.handleGitLabWebhook(webhookData, headers);
      } else {
        return this.handleGitHubWebhook(webhookData, headers);
      }
    } catch (error) {
      this.logger.error(
        'Failed to handle pipeline webhook',
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
    // Validate it's a pipeline event
    if (webhookData.object_kind !== 'pipeline') {
      return { status: 'skipped', reason: 'Not a pipeline event' };
    }

    // Check if pipeline failed
    if (webhookData.object_attributes?.status !== 'failed') {
      return { status: 'skipped', reason: 'Pipeline did not fail' };
    }

    // Extract MR IID if present
    let mrIid: number | undefined;
    const ref = webhookData.object_attributes?.ref;

    if (webhookData.merge_request) {
      mrIid = webhookData.merge_request.iid;
    } else if (ref?.includes('refs/merge-requests/')) {
      const match = ref.match(/refs\/merge-requests\/(\d+)\/head/);
      if (match) {
        mrIid = parseInt(match[1], 10);
      }
    }

    const projectId = webhookData.project?.id || webhookData.project_id;
    const pipelineId = webhookData.object_attributes?.id;

    this.logger.log(
      `Received GitLab pipeline failure webhook for project ${projectId}, pipeline ${pipelineId}`,
    );

    return {
      status: 'accepted',
      message: 'Pipeline failure analysis queued',
      pipelineId,
      mrIid,
    };
  }

  private async handleGitHubWebhook(webhookData: any, headers: Record<string, string>) {
    const eventType = headers['x-github-event'];

    if (eventType !== 'workflow_run') {
      return { status: 'skipped', reason: 'Not a workflow event' };
    }

    // Check if workflow failed
    if (webhookData.workflow_run?.conclusion !== 'failure') {
      return { status: 'skipped', reason: 'Workflow did not fail' };
    }

    // Extract PR number if present
    const prNumber = webhookData.workflow_run?.pull_requests?.[0]?.number;

    this.logger.log(
      `Received GitHub workflow failure webhook for repository ${webhookData.repository?.full_name}`,
    );

    return {
      status: 'accepted',
      message: 'Workflow failure analysis queued',
      workflowId: webhookData.workflow_run?.id,
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
      service: 'pipeline-analysis',
      timestamp: new Date().toISOString(),
    };
  }
}