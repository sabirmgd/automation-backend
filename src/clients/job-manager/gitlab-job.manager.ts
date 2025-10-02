import { Injectable, Logger } from '@nestjs/common';
import { GitlabClient } from '../gitlab.client';
import {
  AbstractJobManager,
  JobDetails,
  JobLogs,
  JobConfig,
  JobWithDetails,
  JobStep,
} from './abstract-job.manager';

@Injectable()
export class GitLabJobManager extends AbstractJobManager {
  private readonly logger = new Logger(GitLabJobManager.name);

  constructor(private readonly gitlabClient: GitlabClient) {
    super();
  }

  async getJobDetails(
    repo: string,
    jobId: string | number,
    token?: string,
  ): Promise<JobDetails> {
    const projectId = repo;

    try {
      const job = await (this.gitlabClient as any).gitlab.Jobs.show(
        projectId,
        jobId,
      );

      return {
        id: job.id,
        name: job.name,
        stage: job.stage,
        status: job.status,
        conclusion: job.status,
        startedAt: job.started_at,
        completedAt: job.finished_at,
        duration: job.duration,
        runner: job.runner?.description,
        allowFailure: job.allow_failure,
        retryCount: job.retry_count || 0,
        failureReason: job.failure_reason,
      };
    } catch (error) {
      this.logger.error(`Failed to get job details for ${jobId}`, error);
      throw error;
    }
  }

  async getJobLogs(
    repo: string,
    jobId: string | number,
    token?: string,
  ): Promise<JobLogs> {
    const projectId = repo;

    try {
      const trace = await (this.gitlabClient as any).gitlab.Jobs.showLog(
        projectId,
        jobId,
      );

      const content = trace;
      const size = Buffer.byteLength(content, 'utf8');

      // Truncate if too large (over 1MB)
      const maxSize = 1024 * 1024;
      const truncated = size > maxSize;
      const finalContent = truncated ? content.substring(0, maxSize) : content;

      return {
        content: finalContent,
        size,
        truncated,
      };
    } catch (error) {
      this.logger.error(`Failed to get job logs for ${jobId}`, error);
      throw error;
    }
  }

  async getJobConfig(
    repo: string,
    jobId: string | number,
    token?: string,
  ): Promise<JobConfig> {
    const projectId = repo;

    try {
      // Get job details
      const job = await (this.gitlabClient as any).gitlab.Jobs.show(
        projectId,
        jobId,
      );

      // Get pipeline to find the ref
      const pipeline = await (this.gitlabClient as any).gitlab.Pipelines.show(
        projectId,
        job.pipeline.id,
      );

      // Get .gitlab-ci.yml content to extract job config
      try {
        const file = await (this.gitlabClient as any).gitlab.RepositoryFiles.show(
          projectId,
          '.gitlab-ci.yml',
          pipeline.ref,
        );

        const yamlContent = Buffer.from(file.content, 'base64').toString('utf-8');

        // Parse YAML to extract job config (simplified - real implementation would need proper YAML parsing)
        // For now, return basic structure based on job data
        return {
          script: job.artifacts_file?.filename ? [job.artifacts_file.filename] : [],
          image: job.tag_list?.[0],
          services: [],
          beforeScript: job.before_script || [],
          afterScript: job.after_script || [],
          when: job.when || 'on_success',
          allowFailure: job.allow_failure || false,
          retry: job.retry || 0,
          timeout: job.timeout ? `${job.timeout}s` : '3600s',
          variables: job.variables || {},
        };
      } catch (error) {
        this.logger.warn(`Could not fetch job config: ${error.message}`);
        return {
          script: [],
          allowFailure: job.allow_failure || false,
          when: job.when || 'on_success',
        };
      }
    } catch (error) {
      this.logger.error(`Failed to get job config for ${jobId}`, error);
      throw error;
    }
  }

  async getJobWithDetails(
    repo: string,
    jobId: string | number,
    token?: string,
  ): Promise<JobWithDetails> {
    const projectId = repo;

    try {
      // Get job details
      const job = await (this.gitlabClient as any).gitlab.Jobs.show(
        projectId,
        jobId,
      );

      // Get logs
      let logs: JobLogs | undefined;
      try {
        logs = await this.getJobLogs(repo, jobId, token);
      } catch (error) {
        this.logger.warn(`Could not fetch logs for job ${jobId}`);
      }

      // Get config
      let config: JobConfig | undefined;
      try {
        config = await this.getJobConfig(repo, jobId, token);
      } catch (error) {
        this.logger.warn(`Could not fetch config for job ${jobId}`);
      }

      return {
        id: job.id,
        name: job.name,
        stage: job.stage,
        status: job.status,
        conclusion: job.status,
        startedAt: job.started_at,
        completedAt: job.finished_at,
        duration: job.duration,
        runner: job.runner?.description,
        allowFailure: job.allow_failure,
        retryCount: job.retry_count || 0,
        failureReason: job.failure_reason,
        logs,
        config,
      };
    } catch (error) {
      this.logger.error(`Failed to get job with details for ${jobId}`, error);
      throw error;
    }
  }

  async retryJob(
    repo: string,
    jobId: string | number,
    token?: string,
  ): Promise<JobDetails> {
    const projectId = repo;

    try {
      const retriedJob = await (this.gitlabClient as any).gitlab.Jobs.retry(
        projectId,
        jobId,
      );

      return {
        id: retriedJob.id,
        name: retriedJob.name,
        stage: retriedJob.stage,
        status: retriedJob.status,
        conclusion: retriedJob.status,
        startedAt: retriedJob.started_at,
        completedAt: retriedJob.finished_at,
        duration: retriedJob.duration,
        runner: retriedJob.runner?.description,
        allowFailure: retriedJob.allow_failure,
        retryCount: (retriedJob.retry_count || 0) + 1,
      };
    } catch (error) {
      this.logger.error(`Failed to retry job ${jobId}`, error);
      throw error;
    }
  }

  async cancelJob(
    repo: string,
    jobId: string | number,
    token?: string,
  ): Promise<boolean> {
    const projectId = repo;

    try {
      await (this.gitlabClient as any).gitlab.Jobs.cancel(
        projectId,
        jobId,
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to cancel job ${jobId}`, error);
      return false;
    }
  }
}