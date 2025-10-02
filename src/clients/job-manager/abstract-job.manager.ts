export interface JobDetails {
  id: string | number;
  name: string;
  stage?: string;
  status: string;
  conclusion?: string;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  runner?: string;
  runnerGroup?: string;
  allowFailure?: boolean;
  retryCount?: number;
  failureReason?: string;
}

export interface JobLogs {
  content: string;
  size?: number;
  truncated?: boolean;
}

export interface JobConfig {
  script?: string[];
  image?: string;
  services?: string[];
  beforeScript?: string[];
  afterScript?: string[];
  when?: string;
  allowFailure?: boolean;
  retry?: number;
  timeout?: string;
  variables?: Record<string, string>;
}

export interface JobStep {
  name: string;
  status: string;
  conclusion?: string;
  number: number;
  startedAt?: string;
  completedAt?: string;
}

export interface JobWithDetails extends JobDetails {
  logs?: JobLogs;
  config?: JobConfig;
  steps?: JobStep[];
}

export abstract class AbstractJobManager {
  /**
   * Get job details
   */
  abstract getJobDetails(
    repo: string,
    jobId: string | number,
    token?: string,
  ): Promise<JobDetails>;

  /**
   * Get job logs
   */
  abstract getJobLogs(
    repo: string,
    jobId: string | number,
    token?: string,
  ): Promise<JobLogs>;

  /**
   * Get job configuration
   */
  abstract getJobConfig(
    repo: string,
    jobId: string | number,
    token?: string,
  ): Promise<JobConfig>;

  /**
   * Get all job information including logs and config
   */
  abstract getJobWithDetails(
    repo: string,
    jobId: string | number,
    token?: string,
  ): Promise<JobWithDetails>;

  /**
   * Retry a failed job
   */
  abstract retryJob(
    repo: string,
    jobId: string | number,
    token?: string,
  ): Promise<JobDetails>;

  /**
   * Cancel a running job
   */
  abstract cancelJob(
    repo: string,
    jobId: string | number,
    token?: string,
  ): Promise<boolean>;
}