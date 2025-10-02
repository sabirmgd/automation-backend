import { z } from 'zod';

export const PipelineFailureTypeSchema = z.enum([
  'yaml_syntax_error',
  'job_dependency_error',
  'missing_job_definition',
  'invalid_configuration',
  'resource_constraint',
  'permission_issue',
  'network_issue',
  'multiple_job_failures',
  'pipeline_timeout',
  'external_service',
  'unknown'
]);

export const ConfidenceLevelSchema = z.enum(['high', 'medium', 'low']);

export const FailedJobInfoSchema = z.object({
  jobName: z.string(),
  stage: z.string(),
  failureReason: z.string().optional()
});

export const PipelineAnalysisInputSchema = z.object({
  pipelineId: z.string().describe('Unique identifier for the pipeline'),
  pipelineName: z.string().optional().describe('Name of the pipeline'),
  platform: z.enum(['github', 'gitlab']).describe('CI/CD platform'),
  projectId: z.string().describe('Project/Repository identifier'),
  ref: z.string().optional().describe('Git ref (branch/tag)'),
  triggeredBy: z.string().optional().describe('User who triggered the pipeline'),
  status: z.string().describe('Pipeline status'),
  failedJobsCount: z.number().describe('Number of failed jobs'),
  totalJobsCount: z.number().describe('Total number of jobs'),
  config: z.string().optional().describe('Pipeline configuration (YAML)'),
  errorMessage: z.string().optional().describe('Pipeline error message'),
  failedJobs: z.array(FailedJobInfoSchema).optional().describe('List of failed jobs'),
  hasConfigError: z.boolean().optional().describe('Whether pipeline has configuration error')
});

export const PipelineAnalysisOutputSchema = z.object({
  failureType: PipelineFailureTypeSchema.describe('Category of pipeline failure'),
  rootCause: z.string().describe('Clear explanation of why the pipeline failed'),
  affectedComponent: z.string().describe('Specific component or configuration that failed'),
  errorDetails: z.array(z.string()).describe('Key error messages found'),
  suggestedFixSteps: z.array(z.string()).describe('Step-by-step fix instructions'),
  suggestedFixCommands: z.array(z.string()).optional().describe('Specific commands to run'),
  preventionTips: z.array(z.string()).optional().describe('Best practices to prevent recurrence'),
  confidence: ConfidenceLevelSchema.describe('Confidence in the analysis'),
  additionalContext: z.string().optional().describe('Additional warnings or context'),
  relatedFiles: z.array(z.string()).optional().describe('Files that may need modification'),
  estimatedFixTime: z.string().optional().describe('Rough time estimate to fix'),
  failedJobNames: z.array(z.string()).optional().describe('Names of failed jobs'),
  failedJobStages: z.array(z.string()).optional().describe('Stages of failed jobs')
});

export type PipelineAnalysisInput = z.infer<typeof PipelineAnalysisInputSchema>;
export type PipelineAnalysisOutput = z.infer<typeof PipelineAnalysisOutputSchema>;
export type PipelineFailureType = z.infer<typeof PipelineFailureTypeSchema>;
export type FailedJobInfo = z.infer<typeof FailedJobInfoSchema>;