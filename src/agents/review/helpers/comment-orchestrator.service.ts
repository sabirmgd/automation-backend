import { Injectable, Logger } from '@nestjs/common';
import { GitLabMrManager } from '../../../clients/mr-manager/gitlab-mr.manager';
import { GitHubMrManager } from '../../../clients/mr-manager/github-mr.manager';
import { DetailedReviewOutput } from '../schemas/review.schemas';
import { DiffPosition } from '../../../clients/mr-manager/abstract-mr.manager';

export interface InlineCommentResult {
  successful: number;
  failed: number;
  errors: Array<{
    file: string;
    line: number;
    error: string;
  }>;
}

@Injectable()
export class CommentOrchestratorService {
  private readonly logger = new Logger(CommentOrchestratorService.name);

  constructor(
    private readonly gitlabMrManager: GitLabMrManager,
    private readonly githubMrManager: GitHubMrManager,
  ) {}

  async postInlineComments(
    provider: 'github' | 'gitlab',
    repo: string,
    prNumber: number,
    reviewData: DetailedReviewOutput,
  ): Promise<InlineCommentResult> {
    const result: InlineCommentResult = {
      successful: 0,
      failed: 0,
      errors: [],
    };

    const mrManager = provider === 'github' ? this.githubMrManager : this.gitlabMrManager;

    for (const suggestion of reviewData.suggestions) {
      if (!suggestion.file || !suggestion.startLine) {
        this.logger.warn(`Skipping suggestion without file or line number`);
        continue;
      }

      try {
        const position = await mrManager.getCommentPosition(
          repo,
          prNumber,
          suggestion.file,
          suggestion.startLine,
        );

        if (!position) {
          this.logger.warn(`Could not determine position for ${suggestion.file}:${suggestion.startLine}`);
          result.failed++;
          result.errors.push({
            file: suggestion.file,
            line: suggestion.startLine,
            error: 'Could not determine comment position',
          });
          continue;
        }

        const body = this.formatCommentBody(suggestion);

        await mrManager.createInlineComment(
          repo,
          prNumber,
          body,
          suggestion.file,
          position,
        );

        result.successful++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          file: suggestion.file,
          line: suggestion.startLine,
          error: error instanceof Error ? error.message : String(error),
        });
        this.logger.error(
          `Failed to post comment for ${suggestion.file}:${suggestion.startLine}`,
          error,
        );
      }
    }

    this.logger.log(
      `Posted ${result.successful} inline comments, ${result.failed} failed`,
    );

    return result;
  }

  private formatCommentBody(suggestion: any): string {
    const severityEmoji = this.getSeverityEmoji(suggestion.severity);
    const typeLabel = this.getTypeLabel(suggestion.suggestionType);

    let body = `${severityEmoji} **[${typeLabel}]** ${suggestion.action}\n\n`;
    body += `**Reason:** ${suggestion.reason}\n`;

    if (suggestion.patch) {
      body += '\n**Suggested change:**\n';
      body += '```diff\n';
      body += suggestion.patch;
      body += '\n```\n';
    }

    if (suggestion.endLine && suggestion.endLine > suggestion.startLine) {
      body += `\n*Lines ${suggestion.startLine}-${suggestion.endLine}*`;
    }

    return body;
  }

  private getSeverityEmoji(severity?: string): string {
    const emojiMap: Record<string, string> = {
      critical: '🔴',
      major: '🟠',
      minor: '🟡',
      info: 'ℹ️',
    };
    return emojiMap[severity?.toLowerCase() || 'minor'] || '💬';
  }

  private getTypeLabel(type?: string): string {
    const labelMap: Record<string, string> = {
      ERROR: 'Error',
      WARNING: 'Warning',
      IMPROVEMENT: 'Improvement',
      SECURITY: 'Security',
      PERFORMANCE: 'Performance',
      BEST_PRACTICE: 'Best Practice',
    };
    return labelMap[type || 'IMPROVEMENT'] || 'Comment';
  }
}