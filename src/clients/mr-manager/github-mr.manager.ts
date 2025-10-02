import { Injectable, Logger } from '@nestjs/common';
import { GithubClient } from '../github.client';
import {
  AbstractMrManager,
  PullRequestResult,
  ConflictCheckResult,
  DiffPosition,
  CommentResult,
  PullRequestDiff,
} from './abstract-mr.manager';
import { DiffParser } from '../../agents/review/helpers/diff-parser.util';

@Injectable()
export class GitHubMrManager extends AbstractMrManager {
  private readonly logger = new Logger(GitHubMrManager.name);

  constructor(private readonly githubClient: GithubClient) {
    super();
  }

  async createPullRequest(
    repo: string,
    fromBranch: string,
    toBranch: string,
    title: string,
    description?: string,
    token?: string,
  ): Promise<PullRequestResult> {
    const [owner, repoName] = repo.split('/');

    // Use provided token if available, otherwise fall back to default client
    let octokit = (this.githubClient as any).octokit;

    if (token) {
      const { getOctokit } = await import('../octokit.wrapper');
      const Octokit = await getOctokit();
      octokit = new Octokit({ auth: token });
    }

    const { data } = await octokit.pulls.create({
      owner,
      repo: repoName,
      title,
      body: description,
      head: fromBranch,
      base: toBranch,
    });

    return {
      id: data.id,
      number: data.number,
      url: data.html_url,
      title: data.title,
      sourceBranch: data.head.ref,
      targetBranch: data.base.ref,
      status: data.state,
      hasConflicts: data.mergeable === false,
    };
  }

  async checkForConflicts(
    repo: string,
    fromBranch: string,
    toBranch: string,
    token?: string,
  ): Promise<ConflictCheckResult> {
    const [owner, repoName] = repo.split('/');

    // Use provided token if available, otherwise fall back to default client
    let octokit = (this.githubClient as any).octokit;

    if (token) {
      const { getOctokit } = await import('../octokit.wrapper');
      const Octokit = await getOctokit();
      octokit = new Octokit({ auth: token });
    }

    try {
      const { data: comparison } = await octokit.repos.compareCommits({
        owner,
        repo: repoName,
        base: toBranch,
        head: fromBranch,
      });

      const tempPr = await octokit.pulls.create({
        owner,
        repo: repoName,
        title: `[TEMP] Conflict check ${fromBranch} -> ${toBranch}`,
        head: fromBranch,
        base: toBranch,
        draft: true,
      });

      const { data: prDetails } = await octokit.pulls.get({
        owner,
        repo: repoName,
        pull_number: tempPr.data.number,
      });

      await octokit.pulls.update({
        owner,
        repo: repoName,
        pull_number: tempPr.data.number,
        state: 'closed',
      });

      return {
        hasConflicts: prDetails.mergeable === false,
        canAutoMerge: prDetails.mergeable === true,
        conflictingFiles: prDetails.mergeable === false
          ? comparison.files?.map((f: any) => f.filename)
          : undefined,
      };
    } catch (error) {
      return {
        hasConflicts: true,
        canAutoMerge: false,
      };
    }
  }

  async getPullRequestStatus(
    repo: string,
    prNumber: number,
    token?: string,
  ): Promise<PullRequestResult> {
    const [owner, repoName] = repo.split('/');

    // Use provided token if available, otherwise fall back to default client
    let octokit = (this.githubClient as any).octokit;

    if (token) {
      const { getOctokit } = await import('../octokit.wrapper');
      const Octokit = await getOctokit();
      octokit = new Octokit({ auth: token });
    }

    const { data } = await octokit.pulls.get({
      owner,
      repo: repoName,
      pull_number: prNumber,
    });

    return {
      id: data.id,
      number: data.number,
      url: data.html_url,
      title: data.title,
      sourceBranch: data.head.ref,
      targetBranch: data.base.ref,
      status: data.state,
      hasConflicts: data.mergeable === false,
    };
  }

  async listPullRequests(
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open',
    token?: string,
  ): Promise<PullRequestResult[]> {
    const [owner, repoName] = repo.split('/');

    // Use provided token if available, otherwise fall back to default client
    let octokit = (this.githubClient as any).octokit;

    if (token) {
      const { getOctokit } = await import('../octokit.wrapper');
      const Octokit = await getOctokit();
      octokit = new Octokit({ auth: token });
    }

    const { data } = await octokit.pulls.list({
      owner,
      repo: repoName,
      state,
      per_page: 100,
    });

    return data.map((pr: any) => ({
      id: pr.id,
      number: pr.number,
      url: pr.html_url,
      title: pr.title,
      sourceBranch: pr.head.ref,
      targetBranch: pr.base.ref,
      status: pr.state,
      hasConflicts: pr.mergeable === false,
    }));
  }

  async getPullRequestDiff(
    repo: string,
    prNumber: number,
    token?: string,
  ): Promise<string> {
    const [owner, repoName] = repo.split('/');

    // Use provided token if available, otherwise fall back to default client
    let octokit = (this.githubClient as any).octokit;

    if (token) {
      const { getOctokit } = await import('../octokit.wrapper');
      const Octokit = await getOctokit();
      octokit = new Octokit({ auth: token });
    }

    const { data } = await octokit.pulls.get({
      owner,
      repo: repoName,
      pull_number: prNumber,
      mediaType: {
        format: 'diff',
      },
    });

    return data;
  }

  async getPullRequestChanges(
    repo: string,
    prNumber: number,
    token?: string,
  ): Promise<PullRequestDiff[]> {
    const [owner, repoName] = repo.split('/');

    // Use provided token if available, otherwise fall back to default client
    let octokit = (this.githubClient as any).octokit;

    if (token) {
      const { getOctokit } = await import('../octokit.wrapper');
      const Octokit = await getOctokit();
      octokit = new Octokit({ auth: token });
    }

    const { data } = await octokit.pulls.listFiles({
      owner,
      repo: repoName,
      pull_number: prNumber,
      per_page: 100,
    });

    return data.map((file: any) => ({
      oldPath: file.previous_filename,
      newPath: file.filename,
      diff: file.patch || '',
      newFile: file.status === 'added',
      deletedFile: file.status === 'removed',
      renamedFile: file.status === 'renamed',
    }));
  }

  async createInlineComment(
    repo: string,
    prNumber: number,
    body: string,
    path: string,
    position: DiffPosition,
    token?: string,
  ): Promise<CommentResult> {
    const [owner, repoName] = repo.split('/');

    // Use provided token if available, otherwise fall back to default client
    let octokit = (this.githubClient as any).octokit;

    if (token) {
      const { getOctokit } = await import('../octokit.wrapper');
      const Octokit = await getOctokit();
      octokit = new Octokit({ auth: token });
    }

    try {
      // GitHub API expects both line and start_line to be in the NEW file
      // For multi-line comments, start_line is the beginning of the range
      const commentData: any = {
        owner,
        repo: repoName,
        pull_number: prNumber,
        body,
        path,
        commit_id: position.headSha,
        line: position.newLine,  // End line in NEW file
        side: 'RIGHT',
      };

      // Only add start_line for multi-line comments
      // Both line and start_line should reference the NEW file
      if (position.startLine && position.startLine !== position.newLine) {
        commentData.start_line = position.startLine;  // Start line in NEW file
      }

      const { data } = await octokit.pulls.createReviewComment(commentData);

      return {
        id: data.id.toString(),
        url: data.html_url,
        body: data.body,
        createdAt: new Date(data.created_at),
      };
    } catch (error) {
      this.logger.error(
        `Failed to create inline comment for PR #${prNumber}`,
        error,
      );
      throw error;
    }
  }

  async createBulkComments(
    repo: string,
    prNumber: number,
    comments: Array<{
      body: string;
      path: string;
      position: DiffPosition;
    }>,
    token?: string,
  ): Promise<CommentResult[]> {
    const [owner, repoName] = repo.split('/');
    const results: CommentResult[] = [];

    try {
      // Use provided token if available, otherwise fall back to default client
      let octokit = (this.githubClient as any).octokit;

      if (token) {
        const { getOctokit } = await import('../octokit.wrapper');
        const Octokit = await getOctokit();
        octokit = new Octokit({ auth: token });
      }

      const { data: pr } = await octokit.pulls.get({
        owner,
        repo: repoName,
        pull_number: prNumber,
      });

      const reviewComments = comments.map(comment => {
        const reviewComment: any = {
          path: comment.path,
          body: comment.body,
          line: comment.position.newLine,  // End line in new file
          side: 'RIGHT',
        };

        // Add start_line for multi-line comments (both in NEW file)
        if (comment.position.startLine && comment.position.startLine !== comment.position.newLine) {
          reviewComment.start_line = comment.position.startLine;
        }

        return reviewComment;
      });

      const { data } = await octokit.pulls.createReview({
        owner,
        repo: repoName,
        pull_number: prNumber,
        commit_id: pr.head.sha,
        event: 'COMMENT',
        comments: reviewComments,
      });

      return reviewComments.map((_, index) => ({
        id: `review-${data.id}-comment-${index}`,
        url: data.html_url,
        body: reviewComments[index].body,
        createdAt: new Date(data.submitted_at),
      }));
    } catch (error) {
      this.logger.error(
        `Failed to create bulk comments for PR #${prNumber}`,
        error,
      );
      throw error;
    }
  }

  async getCommentPosition(
    repo: string,
    prNumber: number,
    path: string,
    lineNumber: number,
    token?: string,
  ): Promise<DiffPosition | null> {
    const [owner, repoName] = repo.split('/');

    try {
      // Use provided token if available, otherwise fall back to default client
      let octokit = (this.githubClient as any).octokit;

      if (token) {
        const { getOctokit } = await import('../octokit.wrapper');
        const Octokit = await getOctokit();
        octokit = new Octokit({ auth: token });
      }

      // Get PR details
      const { data: pr } = await octokit.pulls.get({
        owner,
        repo: repoName,
        pull_number: prNumber,
      });

      // Get the files changed in the PR to validate the line exists
      try {
        const { data: files } = await octokit.pulls.listFiles({
          owner,
          repo: repoName,
          pull_number: prNumber,
          per_page: 100,
        });

        // Find the specific file
        const file = files.find(f => f.filename === path);
        if (!file) {
          this.logger.warn(`File ${path} not found in PR #${prNumber} diff`);
          return null;
        }

        // If there's a patch, validate the line number
        if (file.patch) {
          const diffMapping = DiffParser.mapDiffLines(file.patch);
          const validLine = diffMapping.find(m => m.newLine === lineNumber);

          if (!validLine) {
            this.logger.warn(
              `Line ${lineNumber} not found in changed sections of ${path}. ` +
              `File has ${file.additions} additions and ${file.deletions} deletions.`
            );
            // Still return the position as GitHub might accept it
            // but log the warning for debugging
          }
        }
      } catch (validationError) {
        this.logger.warn(`Could not validate line position: ${validationError.message}`);
        // Continue anyway as this is just validation
      }

      return {
        baseSha: pr.base.sha,
        headSha: pr.head.sha,
        newPath: path,
        newLine: lineNumber,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get comment position for PR #${prNumber}`,
        error,
      );
      this.logger.error(`Error details: ${JSON.stringify(error.response?.data || error.message)}`);
      return null;
    }
  }
}