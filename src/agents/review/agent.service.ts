import { Injectable, Logger } from '@nestjs/common';
import { ChatAnthropic } from '@langchain/anthropic';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { DetailedReviewSchema, DetailedReviewOutput } from './schemas/review.schemas';
import { reviewPrompt } from './prompts/review.prompt';
import { DiffParser } from './helpers/diff-parser.util';

@Injectable()
export class ReviewAgentService {
  private readonly logger = new Logger(ReviewAgentService.name);
  private model: ChatAnthropic;

  constructor(private readonly configService: ConfigService) {
    this.initializeModel();
  }

  private initializeModel() {
    this.model = new ChatAnthropic({
      apiKey: this.configService.get<string>('COCO_API_KEY'),
      model: 'claude-opus-4-1-20250805',
      maxTokens: 30000,
      streaming: true, // Enable streaming to avoid timeout issues
      maxRetries: 3,
      thinking: {
        type: 'enabled',
        budget_tokens: 10000,
      } as any,
    });
  }

  async reviewPullRequest(
    diff: string,
    extraInstructions?: string,
  ): Promise<DetailedReviewOutput> {
    this.logger.log('Starting PR review with Claude Opus');

    try {
      // Preprocess diff with line numbers
      const numberedDiff = DiffParser.formatDiffWithLineNumbers(diff);
      this.logger.debug('Diff preprocessed with line numbers');

      const structuredModel = this.model.withStructuredOutput<any>(DetailedReviewSchema);

      const prompt = reviewPrompt(numberedDiff, extraInstructions);

      // Invoke with structured output (streaming is handled internally)
      const result = await structuredModel.invoke(prompt) as DetailedReviewOutput;

      this.logger.log(`Review completed with ${result.suggestions.length} suggestions`);

      // Log line numbers for debugging
      if (result.suggestions.length > 0) {
        this.logger.debug('Extracted line numbers from LLM:');
        result.suggestions.forEach((s, i) => {
          this.logger.debug(
            `  [${i + 1}] ${s.file}: lines ${s.startLine || s.lineNumber}` +
            (s.endLine ? `-${s.endLine}` : '') +
            ` (${s.suggestionType}, ${s.severity})`
          );
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to generate review', error);
      throw new Error(`Review generation failed: ${error.message}`);
    }
  }

  async reviewWithContext(
    diff: string,
    context: {
      title?: string;
      description?: string;
      author?: string;
      targetBranch?: string;
      filesChanged?: number;
    },
    extraInstructions?: string,
  ): Promise<DetailedReviewOutput> {
    this.logger.log('Starting contextual PR review');

    const contextInfo = `
PR Title: ${context.title || 'N/A'}
Description: ${context.description || 'N/A'}
Author: ${context.author || 'N/A'}
Target Branch: ${context.targetBranch || 'N/A'}
Files Changed: ${context.filesChanged || 'N/A'}
    `.trim();

    const enhancedDiff = `${contextInfo}\n\n---\n\n${diff}`;

    return this.reviewPullRequest(enhancedDiff, extraInstructions);
  }

  async batchReview(
    diffs: Array<{
      id: string;
      diff: string;
      context?: any;
    }>,
    extraInstructions?: string,
  ): Promise<Map<string, DetailedReviewOutput>> {
    this.logger.log(`Starting batch review for ${diffs.length} PRs`);
    const results = new Map<string, DetailedReviewOutput>();

    for (const item of diffs) {
      try {
        const review = item.context
          ? await this.reviewWithContext(item.diff, item.context, extraInstructions)
          : await this.reviewPullRequest(item.diff, extraInstructions);

        results.set(item.id, review);
      } catch (error) {
        this.logger.error(`Failed to review PR ${item.id}`, error);
        results.set(item.id, {
          suggestions: [],
          overallAssessment: `Review failed: ${error.message}`,
        });
      }
    }

    return results;
  }

  async validateReview(review: any): Promise<boolean> {
    try {
      DetailedReviewSchema.parse(review);
      return true;
    } catch (error) {
      this.logger.error('Review validation failed', error);
      return false;
    }
  }
}