import { Injectable, Logger } from '@nestjs/common';
import { ChatAnthropic } from '@langchain/anthropic';
import { ConfigService } from '@nestjs/config';
import {
  PipelineAnalysisInput,
  PipelineAnalysisOutput,
  PipelineAnalysisOutputSchema,
} from './schemas/pipeline-analysis.schema';
import {
  pipelineAnalysisSystemPrompt,
  pipelineAnalysisUserPrompt,
} from './prompts/pipeline-analysis.prompt';
import { PipelineAnalysis } from '../../git/entities/pipeline-analysis.entity';
import { detectPipelineFailureType } from './utils/pipeline-detector.util';
import { validateYamlConfig } from './utils/yaml-validator.util';

@Injectable()
export class PipelineAnalysisAgent {
  private readonly logger = new Logger(PipelineAnalysisAgent.name);
  private llm: ChatAnthropic;

  constructor(private readonly configService: ConfigService) {
    this.llm = new ChatAnthropic({
      apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
      model: 'claude-opus-4-1-20250805',
      temperature: 0.1,
      maxTokens: 10000,
      streaming: true,
    });
  }

  async analyzePipeline(
    input: PipelineAnalysisInput
  ): Promise<PipelineAnalysisOutput> {
    try {
      this.logger.log(
        `Analyzing pipeline ${input.pipelineName || input.pipelineId}`
      );

      // Quick validation of YAML config if available
      let configValidation = null;
      if (input.config) {
        configValidation = validateYamlConfig(input.config, input.platform);
        if (configValidation && !configValidation.valid) {
          this.logger.debug(
            `YAML validation errors found: ${configValidation.errors.join(', ')}`
          );
        }
      }

      // Quick detection of pipeline failure type
      const quickDetection = detectPipelineFailureType(
        input.hasConfigError || false,
        input.failedJobsCount,
        input.errorMessage || '',
        configValidation
      );

      // Prepare the structured LLM
      const structuredLlm = this.llm.withStructuredOutput<PipelineAnalysisOutput>(
        PipelineAnalysisOutputSchema as any
      );

      // Generate the user prompt
      const userPrompt = pipelineAnalysisUserPrompt({
        platform: input.platform,
        pipelineName: input.pipelineName,
        status: input.status,
        failedJobsCount: input.failedJobsCount,
        totalJobsCount: input.totalJobsCount,
        config: input.config,
        errorMessage: input.errorMessage,
        failedJobs: input.failedJobs?.map(job => ({
          jobName: job.jobName || 'unknown',
          stage: job.stage || 'unknown',
          failureReason: job.failureReason,
        })),
        hasConfigError: input.hasConfigError,
      });

      // Get analysis from LLM
      const analysis = (await structuredLlm.invoke([
        {
          role: 'system',
          content: pipelineAnalysisSystemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ])) as PipelineAnalysisOutput;

      // Enhance with quick detection if needed
      if (analysis.confidence === 'low' && quickDetection) {
        this.logger.debug(
          `Enhancing analysis with quick detection: ${quickDetection.type}`
        );
        analysis.failureType = quickDetection.type;
        if (quickDetection.suggestedFix) {
          analysis.suggestedFixSteps = [
            quickDetection.suggestedFix,
            ...analysis.suggestedFixSteps,
          ];
        }
      }

      // Add YAML validation errors if present
      if (configValidation && !configValidation.valid) {
        analysis.errorDetails = [
          ...configValidation.errors,
          ...analysis.errorDetails,
        ].slice(0, 5);
      }

      // Extract failed job names and stages
      if (input.failedJobs && input.failedJobs.length > 0) {
        analysis.failedJobNames = input.failedJobs.map(job => job.jobName);
        analysis.failedJobStages = input.failedJobs.map(job => job.stage);
      }

      this.logger.log(
        `Analysis complete for pipeline: ${analysis.failureType} (${analysis.confidence} confidence)`
      );

      return analysis;
    } catch (error) {
      this.logger.error(
        `Failed to analyze pipeline ${input.pipelineId}`,
        error instanceof Error ? error.stack : String(error)
      );

      return this.getFallbackAnalysis(input, error);
    }
  }

  private getFallbackAnalysis(
    input: PipelineAnalysisInput,
    error: unknown
  ): PipelineAnalysisOutput {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      failureType: input.hasConfigError
        ? 'yaml_syntax_error'
        : input.failedJobsCount > 0
        ? 'multiple_job_failures'
        : 'unknown',
      rootCause:
        input.hasConfigError
          ? 'Pipeline failed due to configuration error preventing execution'
          : input.failedJobsCount > 0
          ? `Pipeline failed with ${input.failedJobsCount} job failure(s)`
          : 'Pipeline failure cause could not be determined',
      affectedComponent:
        input.hasConfigError
          ? 'Pipeline configuration file'
          : 'Pipeline execution',
      errorDetails: [
        input.errorMessage || 'No specific error details available',
        `Analysis error: ${errorMessage}`,
      ],
      suggestedFixSteps: input.hasConfigError
        ? [
            'Validate your pipeline configuration file syntax',
            'Check for missing required fields in job definitions',
            'Verify job dependencies and stage references',
            'Ensure all referenced resources exist',
          ]
        : [
            'Review individual job failures for specific errors',
            'Check job dependencies and execution order',
            'Verify environment variables and secrets',
            'Ensure all required services are available',
          ],
      confidence: 'low',
      additionalContext: 'Automated analysis failed - manual review recommended',
      failedJobNames: input.failedJobs?.map(job => job.jobName),
      failedJobStages: input.failedJobs?.map(job => job.stage),
    };
  }

  async createPipelineAnalysisEntity(
    input: PipelineAnalysisInput,
    output: PipelineAnalysisOutput
  ): Promise<Partial<PipelineAnalysis>> {
    return {
      pipelineId: input.pipelineId,
      pipelineName: input.pipelineName,
      projectId: input.projectId,
      ref: input.ref,
      triggeredBy: input.triggeredBy,
      pipelineStatus: input.status,
      failedJobsCount: input.failedJobsCount,
      totalJobsCount: input.totalJobsCount,
      failureType: output.failureType as any,
      rootCause: output.rootCause,
      affectedComponent: output.affectedComponent,
      errorDetails: output.errorDetails,
      suggestedFixSteps: output.suggestedFixSteps,
      suggestedFixCommands: output.suggestedFixCommands,
      preventionTips: output.preventionTips,
      confidence: output.confidence as any,
      additionalContext: output.additionalContext,
      relatedFiles: output.relatedFiles,
      estimatedFixTime: output.estimatedFixTime,
      failedJobNames: output.failedJobNames,
      failedJobStages: output.failedJobStages,
      analyzedAt: new Date(),
    };
  }
}