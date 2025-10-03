import { Injectable, Logger } from '@nestjs/common';
import { ChatAnthropic } from '@langchain/anthropic';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import {
  JobAnalysisInput,
  JobAnalysisOutput,
  JobAnalysisOutputSchema,
} from './schemas/job-analysis.schema';
import {
  jobAnalysisSystemPrompt,
  jobAnalysisUserPrompt,
} from './prompts/job-analysis.prompt';
import { JobAnalysis } from '../../git/entities/job-analysis.entity';
import { truncateLogs, extractErrorPatterns } from './utils/log-parser.util';
import { detectFailureType } from './utils/failure-detector.util';

@Injectable()
export class JobAnalysisAgent {
  private readonly logger = new Logger(JobAnalysisAgent.name);
  private llm: ChatAnthropic;

  constructor(private readonly configService: ConfigService) {
    this.llm = new ChatAnthropic({
      apiKey: this.configService.get<string>('COCO_API_KEY'),
      model: 'claude-opus-4-1-20250805',
      temperature: 0.1,
      maxTokens: 10000,
      streaming: true,
    });
  }

  async analyzeJob(input: JobAnalysisInput): Promise<JobAnalysisOutput> {
    try {
      this.logger.log(`Analyzing job ${input.jobName} (${input.jobId})`);

      // Skip analysis for jobs that are allowed to fail
      if (input.allowFailure) {
        this.logger.log(
          `Job ${input.jobName} has allowFailure: true, skipping analysis`
        );
        throw new Error(
          `Job ${input.jobName} is configured to allow failure. Analysis skipped.`
        );
      }

      // Pre-process logs to extract key information
      const processedLogs = truncateLogs(input.logs, 10000);
      const errorPatterns = extractErrorPatterns(processedLogs);

      // Quick failure type detection for common patterns
      const quickDetection = detectFailureType(processedLogs, errorPatterns);

      // Generate the user prompt with processed data
      const userPrompt = jobAnalysisUserPrompt({
        platform: input.platform,
        jobName: input.jobName,
        stage: input.stage,
        status: input.status,
        logs: processedLogs,
        config: input.config,
        duration: input.duration,
        runner: input.runner,
      });

      // Prepare the structured LLM
      const structuredLlm = this.llm.withStructuredOutput<JobAnalysisOutput>(JobAnalysisOutputSchema as any);

      // Get analysis from LLM
      const analysis = await structuredLlm.invoke([
        {
          role: 'system',
          content: jobAnalysisSystemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ]) as JobAnalysisOutput;

      // Enhance analysis with quick detection if confidence is low
      if (analysis.confidence === 'low' && quickDetection) {
        this.logger.debug(
          `Enhancing low-confidence analysis with quick detection: ${quickDetection.type}`
        );
        analysis.failureType = quickDetection.type;
        if (quickDetection.suggestedFix) {
          analysis.suggestedFixSteps = [
            quickDetection.suggestedFix,
            ...analysis.suggestedFixSteps,
          ];
        }
      }

      // Add error patterns to error details if not already included
      if (errorPatterns.length > 0) {
        const uniqueErrors = errorPatterns.filter(
          pattern => !analysis.errorDetails.some(detail =>
            detail.toLowerCase().includes(pattern.toLowerCase())
          )
        );
        analysis.errorDetails = [...analysis.errorDetails, ...uniqueErrors].slice(0, 5);
      }

      this.logger.log(
        `Analysis complete for job ${input.jobName}: ${analysis.failureType} (${analysis.confidence} confidence)`
      );

      return analysis;
    } catch (error) {
      this.logger.error(
        `Failed to analyze job ${input.jobName}`,
        error instanceof Error ? error.stack : String(error)
      );

      // Return a fallback analysis
      return this.getFallbackAnalysis(input, error);
    }
  }

  private getFallbackAnalysis(
    input: JobAnalysisInput,
    error: unknown
  ): JobAnalysisOutput {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      failureType: 'unknown',
      rootCause: 'Unable to analyze the job failure due to an error in the analysis process.',
      affectedComponent: input.jobName,
      errorDetails: [
        'Analysis failed - please check logs manually',
        `Analysis error: ${errorMessage}`,
      ],
      suggestedFixSteps: [
        'Review the job logs manually in your CI/CD platform',
        'Check recent changes that might have caused the failure',
        'Verify environment variables and secrets are properly configured',
        'Ensure all dependencies are available and up to date',
      ],
      confidence: 'low',
      additionalContext: `Automated analysis failed. Error: ${errorMessage}`,
    };
  }

  async createJobAnalysisEntity(
    input: JobAnalysisInput,
    output: JobAnalysisOutput
  ): Promise<Partial<JobAnalysis>> {
    return {
      jobId: input.jobId,
      jobName: input.jobName,
      stage: input.stage,
      projectId: input.projectId,
      pipelineId: input.pipelineId,
      ref: input.ref,
      triggeredBy: input.triggeredBy,
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
      analyzedAt: new Date(),
    };
  }
}