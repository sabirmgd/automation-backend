import { Injectable, Logger } from '@nestjs/common';
import { GithubClient } from '../github.client';
import {
  AbstractPipelineManager,
  PipelineResult,
  PipelineDetails,
  PipelineConfig,
  PipelineJob,
} from './abstract-pipeline.manager';

@Injectable()
export class GitHubPipelineManager extends AbstractPipelineManager {
  private readonly logger = new Logger(GitHubPipelineManager.name);

  constructor(private readonly githubClient: GithubClient) {
    super();
  }

  async getFailedPipelines(
    repo: string,
    prNumber: number,
    token?: string,
  ): Promise<PipelineResult[]> {
    const [owner, repoName] = repo.split('/');

    try {
      // Use provided token if available
      let octokit = (this.githubClient as any).octokit;

      if (token) {
        const { getOctokit } = await import('../octokit.wrapper');
        const Octokit = await getOctokit();
        octokit = new Octokit({ auth: token });
      }

      // Get PR details to get the head SHA
      const { data: pr } = await octokit.pulls.get({
        owner,
        repo: repoName,
        pull_number: prNumber,
      });

      // List workflow runs for this PR's head SHA
      const { data } = await octokit.actions.listWorkflowRunsForRepo({
        owner,
        repo: repoName,
        head_sha: pr.head.sha,
        per_page: 100,
      });

      // Filter for failed runs
      const failedRuns = data.workflow_runs.filter(
        (run: any) => run.conclusion === 'failure' || run.status === 'failure'
      );

      return failedRuns.map((run: any) => ({
        id: run.id,
        status: run.status,
        conclusion: run.conclusion,
        ref: run.head_branch,
        sha: run.head_sha,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        url: run.html_url,
        jobsCount: run.run_attempt,
      }));
    } catch (error) {
      this.logger.error(`Failed to get failed pipelines for PR #${prNumber}`, error);
      throw error;
    }
  }

  async getPipelineDetails(
    repo: string,
    pipelineId: string | number,
    token?: string,
  ): Promise<PipelineDetails> {
    const [owner, repoName] = repo.split('/');
    const runId = Number(pipelineId);

    try {
      let octokit = (this.githubClient as any).octokit;

      if (token) {
        const { getOctokit } = await import('../octokit.wrapper');
        const Octokit = await getOctokit();
        octokit = new Octokit({ auth: token });
      }

      // Get workflow run details
      const { data: run } = await octokit.actions.getWorkflowRun({
        owner,
        repo: repoName,
        run_id: runId,
      });

      // Get jobs for this workflow
      const { data: jobsData } = await octokit.actions.listJobsForWorkflowRun({
        owner,
        repo: repoName,
        run_id: runId,
        per_page: 100,
      });

      const jobs = jobsData.jobs.map((job: any) => ({
        id: job.id,
        name: job.name,
        stage: 'job', // GitHub doesn't have stages concept
        status: job.status,
        conclusion: job.conclusion,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        duration: job.completed_at && job.started_at
          ? new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()
          : undefined,
      }));

      const failedJobsCount = jobs.filter(j => j.conclusion === 'failure').length;

      return {
        id: run.id,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        ref: run.head_branch,
        sha: run.head_sha,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        url: run.html_url,
        jobsCount: jobs.length,
        failedJobsCount,
        jobs,
        errorMessage: run.conclusion === 'failure' ? `Workflow ${run.name} failed` : undefined,
        triggeredBy: run.triggering_actor?.login,
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
    const [owner, repoName] = repo.split('/');
    const runId = Number(pipelineId);

    try {
      let octokit = (this.githubClient as any).octokit;

      if (token) {
        const { getOctokit } = await import('../octokit.wrapper');
        const Octokit = await getOctokit();
        octokit = new Octokit({ auth: token });
      }

      // Get workflow run to find the workflow file
      const { data: run } = await octokit.actions.getWorkflowRun({
        owner,
        repo: repoName,
        run_id: runId,
      });

      // Extract workflow path from workflow URL
      const workflowPath = run.path || '.github/workflows/ci.yml';

      // Get the workflow file content
      try {
        const { data: fileData } = await octokit.repos.getContent({
          owner,
          repo: repoName,
          path: workflowPath,
          ref: run.head_sha,
        });

        const content = Buffer.from(fileData.content, 'base64').toString('utf-8');

        return {
          content,
          format: 'yaml',
        };
      } catch (error) {
        this.logger.warn(`Could not fetch workflow config: ${error.message}`);
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
    const [owner, repoName] = repo.split('/');
    const runId = Number(pipelineId);

    try {
      let octokit = (this.githubClient as any).octokit;

      if (token) {
        const { getOctokit } = await import('../octokit.wrapper');
        const Octokit = await getOctokit();
        octokit = new Octokit({ auth: token });
      }

      const { data } = await octokit.actions.listJobsForWorkflowRun({
        owner,
        repo: repoName,
        run_id: runId,
        per_page: 100,
      });

      return data.jobs.map((job: any) => ({
        id: job.id,
        name: job.name,
        stage: 'job',
        status: job.status,
        conclusion: job.conclusion,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        duration: job.completed_at && job.started_at
          ? new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()
          : undefined,
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
    return jobs.filter(job => job.conclusion === 'failure');
  }
}