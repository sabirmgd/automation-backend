import { Injectable, Logger } from '@nestjs/common';
import { GitlabClient } from '../gitlab.client';
import {
  AbstractPipelineManager,
  PipelineResult,
  PipelineDetails,
  PipelineConfig,
  PipelineJob,
} from './abstract-pipeline.manager';

@Injectable()
export class GitLabPipelineManager extends AbstractPipelineManager {
  private readonly logger = new Logger(GitLabPipelineManager.name);

  constructor(private readonly gitlabClient: GitlabClient) {
    super();
  }

  async getFailedPipelines(
    repo: string,
    mrNumber: number,
    token?: string,
  ): Promise<PipelineResult[]> {
    const projectId = repo;

    try {
      // Get MR details to find associated pipelines
      const mergeRequest = await (this.gitlabClient as any).gitlab.MergeRequests.show(
        projectId,
        mrNumber,
      );

      // Get pipelines for this MR
      const pipelines = await (this.gitlabClient as any).gitlab.MergeRequests.pipelines(
        projectId,
        mrNumber,
      );

      // Filter for failed pipelines
      const failedPipelines = pipelines.filter(
        (pipeline: any) => pipeline.status === 'failed'
      );

      return failedPipelines.map((pipeline: any) => ({
        id: pipeline.id,
        status: pipeline.status,
        ref: pipeline.ref,
        sha: pipeline.sha,
        createdAt: pipeline.created_at,
        updatedAt: pipeline.updated_at,
        url: pipeline.web_url,
      }));
    } catch (error) {
      this.logger.error(`Failed to get failed pipelines for MR #${mrNumber}`, error);
      throw error;
    }
  }

  async getPipelineDetails(
    repo: string,
    pipelineId: string | number,
    token?: string,
  ): Promise<PipelineDetails> {
    const projectId = repo;

    try {
      // Get pipeline details
      const pipeline = await (this.gitlabClient as any).gitlab.Pipelines.show(
        projectId,
        pipelineId,
      );

      // Get jobs for this pipeline
      const jobs = await (this.gitlabClient as any).gitlab.Jobs.all({
        projectId,
        pipelineId,
      });

      const pipelineJobs = jobs.map((job: any) => ({
        id: job.id,
        name: job.name,
        stage: job.stage,
        status: job.status,
        conclusion: job.status,
        startedAt: job.started_at,
        completedAt: job.finished_at,
        duration: job.duration,
        allowFailure: job.allow_failure,
      }));

      const failedJobsCount = pipelineJobs.filter(
        j => j.status === 'failed' && !j.allowFailure
      ).length;

      return {
        id: pipeline.id,
        name: `Pipeline #${pipeline.id}`,
        status: pipeline.status,
        ref: pipeline.ref,
        sha: pipeline.sha,
        createdAt: pipeline.created_at,
        updatedAt: pipeline.updated_at,
        url: pipeline.web_url,
        jobsCount: pipelineJobs.length,
        failedJobsCount,
        jobs: pipelineJobs,
        errorMessage: pipeline.status === 'failed' ?
          `Pipeline failed with ${failedJobsCount} job failures` : undefined,
        triggeredBy: pipeline.user?.username,
      };
    } catch (error) {
      this.logger.error(`Failed to get pipeline details for ${pipelineId}`, error);
      throw error;
    }
  }

  async getPipelineConfig(
    repo: string,
    pipelineId: string | number,
    token?: string,
  ): Promise<PipelineConfig> {
    const projectId = repo;

    try {
      // Get pipeline to find the ref
      const pipeline = await (this.gitlabClient as any).gitlab.Pipelines.show(
        projectId,
        pipelineId,
      );

      // Get .gitlab-ci.yml content
      try {
        const file = await (this.gitlabClient as any).gitlab.RepositoryFiles.show(
          projectId,
          '.gitlab-ci.yml',
          pipeline.ref,
        );

        const content = Buffer.from(file.content, 'base64').toString('utf-8');

        return {
          content,
          format: 'yaml',
        };
      } catch (error) {
        this.logger.warn(`Could not fetch pipeline config: ${error.message}`);
        return {
          content: '',
          format: 'yaml',
        };
      }
    } catch (error) {
      this.logger.error(`Failed to get pipeline config for ${pipelineId}`, error);
      throw error;
    }
  }

  async getPipelineJobs(
    repo: string,
    pipelineId: string | number,
    token?: string,
  ): Promise<PipelineJob[]> {
    const projectId = repo;

    try {
      const jobs = await (this.gitlabClient as any).gitlab.Jobs.all({
        projectId,
        pipelineId,
      });

      return jobs.map((job: any) => ({
        id: job.id,
        name: job.name,
        stage: job.stage,
        status: job.status,
        conclusion: job.status,
        startedAt: job.started_at,
        completedAt: job.finished_at,
        duration: job.duration,
        allowFailure: job.allow_failure,
      }));
    } catch (error) {
      this.logger.error(`Failed to get jobs for pipeline ${pipelineId}`, error);
      throw error;
    }
  }

  async getFailedJobs(
    repo: string,
    pipelineId: string | number,
    token?: string,
  ): Promise<PipelineJob[]> {
    const jobs = await this.getPipelineJobs(repo, pipelineId, token);
    return jobs.filter(job => job.status === 'failed' && !job.allowFailure);
  }
}