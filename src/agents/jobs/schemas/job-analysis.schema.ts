import { z } from 'zod';

export const JobFailureTypeSchema = z.enum([
  'syntax_error',
  'configuration_error',
  'dependency_issue',
  'resource_constraint',
  'permission_issue',
  'network_issue',
  'test_failure',
  'build_error',
  'environment_issue',
  'external_service',
  'unknown'
]);

export const ConfidenceLevelSchema = z.enum(['high', 'medium', 'low']);

export const FixStepSchema = z.object({
  step: z.number().describe('Step number in the fix sequence'),
  action: z.string().describe('Clear action to take'),
  command: z.string().optional().describe('Specific command or configuration to apply'),
  explanation: z.string().optional().describe('Brief explanation of why this step is needed')
});

export const JobAnalysisInputSchema = z.object({
  jobId: z.string().describe('Unique identifier for the job'),
  jobName: z.string().describe('Name of the job'),
  stage: z.string().describe('Pipeline stage where the job failed'),
  status: z.string().describe('Current status of the job'),
  platform: z.enum(['github', 'gitlab']).describe('CI/CD platform'),
  projectId: z.string().describe('Project/Repository identifier'),
  pipelineId: z.string().describe('Pipeline/Workflow identifier'),
  ref: z.string().optional().describe('Git ref (branch/tag)'),
  triggeredBy: z.string().optional().describe('User who triggered the job'),
  startedAt: z.string().optional().describe('When the job started'),
  finishedAt: z.string().optional().describe('When the job finished'),
  duration: z.number().optional().describe('Job duration in seconds'),
  runner: z.string().optional().describe('Runner/Agent description'),
  logs: z.string().describe('Job execution logs'),
  config: z.string().optional().describe('Job configuration (YAML)'),
  allowFailure: z.boolean().optional().describe('Whether job can fail without blocking')
});

export const JobAnalysisOutputSchema = z.object({
  failureType: JobFailureTypeSchema.describe('Category of the failure'),
  rootCause: z.string().describe('Clear explanation of why the job failed'),
  affectedComponent: z.string().describe('Specific component that failed'),
  errorDetails: z.array(z.string()).describe('Key error messages found in logs'),
  suggestedFixSteps: z.array(z.string()).describe('Step-by-step fix instructions'),
  suggestedFixCommands: z.array(z.string()).optional().describe('Specific commands to run'),
  preventionTips: z.array(z.string()).optional().describe('Best practices to prevent recurrence'),
  confidence: ConfidenceLevelSchema.describe('Confidence in the analysis'),
  additionalContext: z.string().optional().describe('Additional warnings or context'),
  relatedFiles: z.array(z.string()).optional().describe('Files that may need modification'),
  estimatedFixTime: z.string().optional().describe('Rough time estimate to fix')
});

export type JobAnalysisInput = z.infer<typeof JobAnalysisInputSchema>;
export type JobAnalysisOutput = z.infer<typeof JobAnalysisOutputSchema>;
export type JobFailureType = z.infer<typeof JobFailureTypeSchema>;
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;
export type FixStep = z.infer<typeof FixStepSchema>;