export interface PipelineResult {
  id: string | number;
  status: string;
  conclusion?: string;
  ref: string;
  sha: string;
  createdAt: string;
  updatedAt: string;
  url?: string;
  jobsCount?: number;
  failedJobsCount?: number;
}

export interface PipelineJob {
  id: string | number;
  name: string;
  stage?: string;
  status: string;
  conclusion?: string;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  allowFailure?: boolean;
}

export interface PipelineConfig {
  content: string;
  format?: 'yaml' | 'json';
}

export interface PipelineDetails extends PipelineResult {
  name?: string;
  jobs?: PipelineJob[];
  config?: PipelineConfig;
  errorMessage?: string;
  triggeredBy?: string;
}

export abstract class AbstractPipelineManager {
  /**
   * Get failed pipelines for a merge request/pull request
   */
  abstract getFailedPipelines(
    repo: string,
    mrNumber: number,
    token?: string,
  ): Promise<PipelineResult[]>;

  /**
   * Get pipeline details including jobs
   */
  abstract getPipelineDetails(
    repo: string,
    pipelineId: string | number,
    token?: string,
  ): Promise<PipelineDetails>;

  /**
   * Get pipeline configuration file
   */
  abstract getPipelineConfig(
    repo: string,
    pipelineId: string | number,
    token?: string,
  ): Promise<PipelineConfig>;

  /**
   * Get jobs for a pipeline
   */
  abstract getPipelineJobs(
    repo: string,
    pipelineId: string | number,
    token?: string,
  ): Promise<PipelineJob[]>;

  /**
   * Get only failed jobs for a pipeline
   */
  abstract getFailedJobs(
    repo: string,
    pipelineId: string | number,
    token?: string,
  ): Promise<PipelineJob[]>;
}