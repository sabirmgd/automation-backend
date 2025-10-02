import { Injectable, Logger } from '@nestjs/common';
import { GithubClient } from '../github.client';
import {
  AbstractJobManager,
  JobDetails,
  JobLogs,
  JobConfig,
  JobWithDetails,
  JobStep,
} from './abstract-job.manager';

@Injectable()
export class GitHubJobManager extends AbstractJobManager {
  private readonly logger = new Logger(GitHubJobManager.name);

  constructor(private readonly githubClient: GithubClient) {
    super();
  }

  async getJobDetails(
    repo: string,
    jobId: string | number,
    token?: string,
  ): Promise<JobDetails> {
    const [owner, repoName] = repo.split('/');

    try {
      let octokit = (this.githubClient as any).octokit;

      if (token) {
        const { getOctokit } = await import('../octokit.wrapper');
        const Octokit = await getOctokit();
        octokit = new Octokit({ auth: token });
      }

      const { data: job } = await octokit.actions.getJobForWorkflowRun({
        owner,
        repo: repoName,
        job_id: Number(jobId),
      });

      return {
        id: job.id,
        name: job.name,
        status: job.status,
        conclusion: job.conclusion,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        duration: job.completed_at && job.started_at
          ? new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()
          : undefined,
        runner: job.runner_name,
        runnerGroup: job.runner_group_name,
        retryCount: job.run_attempt,
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
    const [owner, repoName] = repo.split('/');

    try {
      let octokit = (this.githubClient as any).octokit;

      if (token) {
        const { getOctokit } = await import('../octokit.wrapper');
        const Octokit = await getOctokit();
        octokit = new Octokit({ auth: token });
      }

      const { data } = await octokit.actions.downloadJobLogsForWorkflowRun({
        owner,
        repo: repoName,
        job_id: Number(jobId),
      });

      const content = data as string;
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
    const [owner, repoName] = repo.split('/');

    try {
      let octokit = (this.githubClient as any).octokit;

      if (token) {
        const { getOctokit } = await import('../octokit.wrapper');
        const Octokit = await getOctokit();
        octokit = new Octokit({ auth: token });
      }

      // Get job details to find the workflow run
      const { data: job } = await octokit.actions.getJobForWorkflowRun({
        owner,
        repo: repoName,
        job_id: Number(jobId),
      });

      // Get workflow run to find the workflow file
      const { data: run } = await octokit.actions.getWorkflowRun({
        owner,
        repo: repoName,
        run_id: job.run_id,
      });

      // Extract workflow path
      const workflowPath = run.path || '.github/workflows/ci.yml';

      // Get the workflow file content
      try {
        const { data: fileData } = await octokit.repos.getContent({
          owner,
          repo: repoName,
          path: workflowPath,
          ref: run.head_sha,
        });

        const workflowContent = Buffer.from(fileData.content, 'base64').toString('utf-8');

        // Parse YAML to extract job config (simplified - real implementation would need proper YAML parsing)
        // For now, return a basic structure
        return {
          script: job.steps?.map((s: any) => s.name) || [],
          when: 'on_success',
          allowFailure: false,
          timeout: '60m',
          variables: {},
        };
      } catch (error) {
        this.logger.warn(`Could not fetch job config: ${error.message}`);
        return {
          script: [],
          allowFailure: false,
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
    const [owner, repoName] = repo.split('/');

    try {
      let octokit = (this.githubClient as any).octokit;

      if (token) {
        const { getOctokit } = await import('../octokit.wrapper');
        const Octokit = await getOctokit();
        octokit = new Octokit({ auth: token });
      }

      // Get job details
      const { data: job } = await octokit.actions.getJobForWorkflowRun({
        owner,
        repo: repoName,
        job_id: Number(jobId),
      });

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

      // Map steps
      const steps: JobStep[] = job.steps?.map((step: any) => ({
        name: step.name,
        status: step.status,
        conclusion: step.conclusion,
        number: step.number,
        startedAt: step.started_at,
        completedAt: step.completed_at,
      })) || [];

      return {
        id: job.id,
        name: job.name,
        status: job.status,
        conclusion: job.conclusion,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        duration: job.completed_at && job.started_at
          ? new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()
          : undefined,
        runner: job.runner_name,
        runnerGroup: job.runner_group_name,
        retryCount: job.run_attempt,
        logs,
        config,
        steps,
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
    const [owner, repoName] = repo.split('/');

    try {
      let octokit = (this.githubClient as any).octokit;

      if (token) {
        const { getOctokit } = await import('../octokit.wrapper');
        const Octokit = await getOctokit();
        octokit = new Octokit({ auth: token });
      }

      // Get job details first
      const { data: job } = await octokit.actions.getJobForWorkflowRun({
        owner,
        repo: repoName,
        job_id: Number(jobId),
      });

      // Re-run the workflow
      await octokit.actions.reRunWorkflow({
        owner,
        repo: repoName,
        run_id: job.run_id,
      });

      // Return job details
      return {
        id: job.id,
        name: job.name,
        status: 'queued',
        conclusion: undefined,
        startedAt: undefined,
        completedAt: undefined,
        runner: job.runner_name,
        runnerGroup: job.runner_group_name,
        retryCount: (job.run_attempt || 0) + 1,
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
    const [owner, repoName] = repo.split('/');

    try {
      let octokit = (this.githubClient as any).octokit;

      if (token) {
        const { getOctokit } = await import('../octokit.wrapper');
        const Octokit = await getOctokit();
        octokit = new Octokit({ auth: token });
      }

      // Get job details to find the workflow run
      const { data: job } = await octokit.actions.getJobForWorkflowRun({
        owner,
        repo: repoName,
        job_id: Number(jobId),
      });

      // Cancel the workflow run
      await octokit.actions.cancelWorkflowRun({
        owner,
        repo: repoName,
        run_id: job.run_id,
      });

      return true;
    } catch (error) {
      this.logger.error(`Failed to cancel job ${jobId}`, error);
      return false;
    }
  }
}