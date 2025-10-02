import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ReviewComment, CommentSeverity, SuggestionType, CommentMode } from '../entities/review-comment.entity';
import { PullRequest } from '../entities/pull-request.entity';
import { GitRepository } from '../entities/git-repository.entity';
import { ReviewAgentService } from '../../agents/review/agent.service';
import { GitHubMrManager } from '../../clients/mr-manager/github-mr.manager';
import { GitLabMrManager } from '../../clients/mr-manager/gitlab-mr.manager';
import { GitProvider } from '../entities/git-repository.entity';
import { DetailedReviewOutput } from '../../agents/review/schemas/review.schemas';
import { CommentOrchestratorService } from '../../agents/review/helpers/comment-orchestrator.service';
import { GitCredentialsService } from './git-credentials.service';
import { DiffParser, DiffLineMapping } from '../../agents/review/helpers/diff-parser.util';
import { LineValidator } from '../../agents/review/helpers/line-validator.util';
import { randomUUID } from 'crypto';

export interface GenerateReviewDto {
  pullRequestId: string;
  extraInstructions?: string;
  autoApprove?: boolean;
}

export interface ApproveCommentsDto {
  commentIds: string[];
  approvedBy: string;
}

export interface PostCommentsDto {
  pullRequestId: string;
  commentIds?: string[];
  postAll?: boolean;
}

export interface ReviewSummary {
  totalComments: number;
  criticalCount: number;
  majorCount: number;
  minorCount: number;
  infoCount: number;
  approvedCount: number;
  postedCount: number;
}

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    @InjectRepository(ReviewComment)
    private readonly reviewCommentRepository: Repository<ReviewComment>,
    @InjectRepository(PullRequest)
    private readonly pullRequestRepository: Repository<PullRequest>,
    @InjectRepository(GitRepository)
    private readonly gitRepositoryRepository: Repository<GitRepository>,
    @Inject(forwardRef(() => GitCredentialsService))
    private readonly credentialsService: GitCredentialsService,
    private readonly reviewAgentService: ReviewAgentService,
    private readonly githubMrManager: GitHubMrManager,
    private readonly gitlabMrManager: GitLabMrManager,
    private readonly commentOrchestrator: CommentOrchestratorService,
  ) {}

  async generateReview(dto: GenerateReviewDto): Promise<{
    pullRequestId: string;
    reviewSessionId: string;
    comments: ReviewComment[];
    summary: ReviewSummary;
  }> {
    const pullRequest = await this.pullRequestRepository.findOne({
      where: { id: dto.pullRequestId },
      relations: ['repository'],
    });

    if (!pullRequest) {
      throw new NotFoundException(`Pull request ${dto.pullRequestId} not found`);
    }

    const repository = pullRequest.repository;
    if (!repository) {
      throw new NotFoundException(`Repository not found for pull request ${dto.pullRequestId}`);
    }

    const mrManager = this.getMrManager(repository.provider);
    const repoIdentifier = this.getRepoIdentifier(repository);

    this.logger.log(`Generating review for PR #${pullRequest.number} in repository: ${repoIdentifier} (namespace: ${repository.namespace}, name: ${repository.name}, provider: ${repository.provider})`);

    // Get the credential token for the repository
    let token: string | undefined;
    if (repository.credentialId) {
      const credential = await this.credentialsService.getDecryptedCredential(repository.credentialId);
      token = credential.encryptedToken;
    }

    const diff = await mrManager.getPullRequestDiff(repoIdentifier, pullRequest.number, token);

    // Create line mapping for the diff (useful for validation and GitLab)
    const diffMapping = DiffParser.mapDiffLines(diff);
    this.logger.debug(`Created diff mapping with ${diffMapping.length} lines`);

    const review = await this.reviewAgentService.reviewWithContext(
      diff,
      {
        title: pullRequest.title,
        description: pullRequest.description,
        author: pullRequest.authorUsername,
        targetBranch: pullRequest.targetBranch,
        filesChanged: pullRequest.changedFiles,
      },
      dto.extraInstructions,
    );

    const reviewSessionId = randomUUID();
    const comments = await this.saveReviewComments(
      pullRequest.id,
      review,
      reviewSessionId,
      dto.autoApprove,
      diffMapping,
    );

    const summary = this.calculateSummary(comments);

    return {
      pullRequestId: pullRequest.id,
      reviewSessionId,
      comments,
      summary,
    };
  }

  async saveReviewComments(
    pullRequestId: string,
    review: DetailedReviewOutput,
    reviewSessionId: string,
    autoApprove = false,
    diffMapping?: DiffLineMapping[],
  ): Promise<ReviewComment[]> {
    const comments: ReviewComment[] = [];

    for (const suggestion of review.suggestions) {
      const comment = new ReviewComment();
      comment.pullRequestId = pullRequestId;
      comment.file = suggestion.file;

      // Validate and potentially correct line numbers
      let startLine = suggestion.startLine || suggestion.lineNumber || 1;
      let endLine = suggestion.endLine;

      if (diffMapping) {
        // Get the file-specific diff mapping
        const fileDiffs = DiffParser.splitMultiFileDiff(diffMapping.map(m => m.content).join('\n'));
        const fileDiff = fileDiffs.get(suggestion.file);

        if (fileDiff) {
          const fileMapping = DiffParser.mapDiffLines(fileDiff);

          // Validate and potentially correct the line range
          const validatedRange = LineValidator.validateLineRange(fileMapping, startLine, endLine);

          if (validatedRange) {
            startLine = validatedRange.startLine;
            endLine = validatedRange.endLine;

            if (startLine !== (suggestion.startLine || suggestion.lineNumber)) {
              this.logger.warn(
                `Adjusted line for ${suggestion.file}: ${suggestion.startLine || suggestion.lineNumber} -> ${startLine}`
              );
              // Add note to metadata about line adjustment
              comment.metadata = {
                ...comment.metadata,
                lineAdjusted: true,
                originalLine: suggestion.startLine || suggestion.lineNumber,
                adjustedLine: startLine,
              };
            }
          } else {
            // If no valid line found, try to find any valid line
            const bestLine = LineValidator.suggestBestCommentLine(
              fileMapping,
              startLine,
              suggestion.severity as any || 'minor',
            );

            if (bestLine) {
              startLine = bestLine;
              endLine = bestLine;
              this.logger.warn(
                `Using fallback line ${bestLine} for ${suggestion.file} (original: ${suggestion.startLine || suggestion.lineNumber})`
              );
              comment.metadata = {
                ...comment.metadata,
                lineAdjusted: true,
                fallbackUsed: true,
                originalLine: suggestion.startLine || suggestion.lineNumber,
                adjustedLine: bestLine,
              };
            } else {
              this.logger.error(
                `No valid line found for comment in ${suggestion.file} at line ${suggestion.startLine || suggestion.lineNumber}. Skipping.`
              );
              continue; // Skip this comment entirely
            }
          }
        }
      }

      comment.startLine = startLine;
      comment.endLine = endLine;
      comment.commentMode = suggestion.commentMode as any || CommentMode.SINGLE_LINE;
      comment.severity = suggestion.severity as any || CommentSeverity.MINOR;
      comment.suggestionType = suggestion.suggestionType as any || SuggestionType.IMPROVEMENT;
      comment.action = suggestion.action;
      comment.reason = suggestion.reason;
      comment.patch = suggestion.patch;
      comment.approved = autoApprove;
      comment.approvedAt = autoApprove ? new Date() : undefined;
      comment.reviewSessionId = reviewSessionId;

      // Store old line mappings for GitLab support
      if (diffMapping && comment.startLine) {
        const oldStartLine = DiffParser.findOldLineForNewLine(diffMapping, comment.startLine);
        const oldEndLine = comment.endLine ?
          DiffParser.findOldLineForNewLine(diffMapping, comment.endLine) :
          oldStartLine;

        // Store old line numbers for GitLab
        comment.oldStartLine = oldStartLine || undefined;
        comment.oldEndLine = oldEndLine || undefined;

        // Store additional context in metadata
        comment.metadata = {
          ...comment.metadata,
          hasLineMapping: true,
          mappingGenerated: new Date().toISOString(),
        };

        if (oldStartLine) {
          this.logger.debug(
            `Line mapping: new lines ${comment.startLine}-${comment.endLine || comment.startLine} ` +
            `correspond to old lines ${oldStartLine}-${oldEndLine || oldStartLine}`
          );
        }
      }

      comments.push(comment);
    }

    if (comments.length > 0) {
      await this.reviewCommentRepository.save(comments);
      this.logger.log(`Saved ${comments.length} review comments for session ${reviewSessionId}`);
    }

    return comments;
  }

  async getReviewComments(
    pullRequestId: string,
    filters?: {
      approved?: boolean;
      posted?: boolean;
      severity?: string;
      suggestionType?: string;
      reviewSessionId?: string;
    },
  ): Promise<ReviewComment[]> {
    const where: any = { pullRequestId };

    if (filters) {
      if (filters.approved !== undefined) where.approved = filters.approved;
      if (filters.posted !== undefined) where.posted = filters.posted;
      if (filters.severity) where.severity = filters.severity;
      if (filters.suggestionType) where.suggestionType = filters.suggestionType;
      if (filters.reviewSessionId) where.reviewSessionId = filters.reviewSessionId;
    }

    return this.reviewCommentRepository.find({
      where,
      order: {
        severity: 'ASC',
        file: 'ASC',
        startLine: 'ASC',
      },
    });
  }

  async approveComments(dto: ApproveCommentsDto): Promise<{
    approved: number;
    failed: number;
  }> {
    const comments = await this.reviewCommentRepository.findBy({
      id: In(dto.commentIds),
    });

    if (comments.length === 0) {
      throw new NotFoundException('No comments found with provided IDs');
    }

    let approved = 0;
    let failed = 0;

    for (const comment of comments) {
      try {
        comment.approved = true;
        comment.approvedBy = dto.approvedBy;
        comment.approvedAt = new Date();
        await this.reviewCommentRepository.save(comment);
        approved++;
      } catch (error) {
        this.logger.error(`Failed to approve comment ${comment.id}`, error);
        failed++;
      }
    }

    this.logger.log(`Approved ${approved} comments, ${failed} failed`);
    return { approved, failed };
  }

  async postComments(dto: PostCommentsDto): Promise<{
    posted: number;
    failed: number;
    errors: Array<{ commentId: string; error: string }>;
  }> {
    const pullRequest = await this.pullRequestRepository.findOne({
      where: { id: dto.pullRequestId },
      relations: ['repository'],
    });

    if (!pullRequest) {
      throw new NotFoundException(`Pull request ${dto.pullRequestId} not found`);
    }

    const repository = pullRequest.repository;
    if (!repository) {
      throw new NotFoundException(`Repository not found for pull request ${dto.pullRequestId}`);
    }

    let commentsToPost: ReviewComment[];

    if (dto.postAll) {
      commentsToPost = await this.reviewCommentRepository.find({
        where: {
          pullRequestId: dto.pullRequestId,
          approved: true,
          posted: false,
        },
      });
    } else if (dto.commentIds && dto.commentIds.length > 0) {
      commentsToPost = await this.reviewCommentRepository.find({
        where: {
          id: In(dto.commentIds),
          approved: true,
          posted: false,
        },
      });
    } else {
      throw new BadRequestException('Either commentIds or postAll must be provided');
    }

    if (commentsToPost.length === 0) {
      return { posted: 0, failed: 0, errors: [] };
    }

    const mrManager = this.getMrManager(repository.provider);
    const repoIdentifier = this.getRepoIdentifier(repository);

    // Get the credential token for the repository
    let token: string | undefined;
    if (repository.credentialId) {
      const credential = await this.credentialsService.getDecryptedCredential(repository.credentialId);
      token = credential.encryptedToken;
    }

    const commentsData = await Promise.all(
      commentsToPost.map(async (comment) => {
        // For GitLab, use old line if available
        const lineForPosition = repository.provider === GitProvider.GITLAB && comment.oldStartLine
          ? comment.oldStartLine
          : comment.startLine;

        const position = await mrManager.getCommentPosition(
          repoIdentifier,
          pullRequest.number,
          comment.file,
          lineForPosition,
          token,
        );

        // Add platform-specific line info to position
        if (position) {
          if (repository.provider === GitProvider.GITLAB) {
            // GitLab needs old and new line numbers
            position.oldLine = comment.oldStartLine || comment.startLine;
            position.newLine = comment.startLine;
            this.logger.debug(
              `[GitLab] Comment positioning for ${comment.file}: ` +
              `old=${position.oldLine}, new=${position.newLine}`
            );
          } else if (repository.provider === GitProvider.GITHUB) {
            // GitHub needs start and end lines (both in new file)
            if (comment.endLine && comment.endLine !== comment.startLine) {
              position.startLine = comment.startLine;
              position.newLine = comment.endLine;  // newLine is the end line
              this.logger.debug(
                `[GitHub] Multi-line comment for ${comment.file}: ` +
                `start=${position.startLine}, end=${position.newLine}`
              );
            } else {
              position.newLine = comment.startLine;  // Single line comment
              this.logger.debug(
                `[GitHub] Single-line comment for ${comment.file}: line=${position.newLine}`
              );
            }
          }
        }

        return {
          comment,
          body: this.formatCommentBody(comment),
          path: comment.file,
          position,
        };
      }),
    );

    const validComments = commentsData.filter((c) => c.position !== null);

    let posted = 0;
    let failed = 0;
    const errors: Array<{ commentId: string; error: string }> = [];

    if (validComments.length > 0) {
      try {
        const results = await mrManager.createBulkComments(
          repoIdentifier,
          pullRequest.number,
          validComments.map((c) => ({
            body: c.body,
            path: c.path,
            position: c.position!,
          })),
          token,
        );

        for (let i = 0; i < validComments.length; i++) {
          const comment = validComments[i].comment;
          const result = results[i];

          if (result) {
            comment.posted = true;
            comment.postedAt = new Date();
            comment.gitCommentId = result.id;
            await this.reviewCommentRepository.save(comment);
            posted++;
          } else {
            failed++;
            errors.push({
              commentId: comment.id,
              error: 'Failed to post comment',
            });
          }
        }
      } catch (error) {
        this.logger.error('Failed to post bulk comments', error);
        failed = validComments.length;
        for (const c of validComments) {
          errors.push({
            commentId: c.comment.id,
            error: error.message,
          });
        }
      }
    }

    const invalidCount = commentsData.length - validComments.length;
    if (invalidCount > 0) {
      failed += invalidCount;
      const invalidComments = commentsData.filter((c) => c.position === null);
      for (const c of invalidComments) {
        errors.push({
          commentId: c.comment.id,
          error: 'Could not determine comment position',
        });
      }
    }

    this.logger.log(`Posted ${posted} comments, ${failed} failed`);
    return { posted, failed, errors };
  }

  private formatCommentBody(comment: ReviewComment): string {
    let body = `${comment.action}\n\n`;
    body += `${comment.reason}`;

    if (comment.patch) {
      body += '\n\n```diff\n';
      body += comment.patch;
      body += '\n```';
    }

    return body;
  }

  private getSeverityEmoji(severity: string): string {
    const emojiMap: Record<string, string> = {
      critical: '🔴',
      major: '🟠',
      minor: '🟡',
      info: 'ℹ️',
    };
    return emojiMap[severity.toLowerCase()] || '💬';
  }

  private getTypeLabel(type: string): string {
    const labelMap: Record<string, string> = {
      ERROR: 'Error',
      WARNING: 'Warning',
      IMPROVEMENT: 'Improvement',
      SECURITY: 'Security',
      PERFORMANCE: 'Performance',
      BEST_PRACTICE: 'Best Practice',
    };
    return labelMap[type] || 'Comment';
  }

  private getMrManager(provider: GitProvider) {
    switch (provider) {
      case GitProvider.GITHUB:
        return this.githubMrManager;
      case GitProvider.GITLAB:
        return this.gitlabMrManager;
      default:
        throw new BadRequestException(`Unsupported provider: ${provider}`);
    }
  }

  private getRepoIdentifier(repository: GitRepository): string {
    if (repository.provider === GitProvider.GITHUB) {
      return `${repository.namespace}/${repository.name}`;
    } else if (repository.provider === GitProvider.GITLAB) {
      return repository.remoteId || repository.name;
    }
    return repository.name;
  }

  private calculateSummary(comments: ReviewComment[]): ReviewSummary {
    return {
      totalComments: comments.length,
      criticalCount: comments.filter((c) => c.severity === 'critical').length,
      majorCount: comments.filter((c) => c.severity === 'major').length,
      minorCount: comments.filter((c) => c.severity === 'minor').length,
      infoCount: comments.filter((c) => c.severity === 'info').length,
      approvedCount: comments.filter((c) => c.approved).length,
      postedCount: comments.filter((c) => c.posted).length,
    };
  }

  async deleteComments(commentIds: string[]): Promise<{ deleted: number }> {
    const result = await this.reviewCommentRepository.delete({
      id: In(commentIds),
      posted: false,
    });

    return { deleted: result.affected || 0 };
  }

  async getReviewSummary(pullRequestId: string): Promise<ReviewSummary> {
    const comments = await this.reviewCommentRepository.find({
      where: { pullRequestId },
    });

    return this.calculateSummary(comments);
  }
}