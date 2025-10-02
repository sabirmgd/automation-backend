import { Injectable, Logger } from '@nestjs/common';
import { GitlabClient } from '../gitlab.client';
import {
  AbstractMrManager,
  PullRequestResult,
  ConflictCheckResult,
  DiffPosition,
  CommentResult,
  PullRequestDiff,
} from './abstract-mr.manager';

@Injectable()
export class GitLabMrManager extends AbstractMrManager {
  private readonly logger = new Logger(GitLabMrManager.name);

  constructor(private readonly gitlabClient: GitlabClient) {
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
    const projectId = repo;

    const mergeRequest = await (this.gitlabClient as any).gitlab.MergeRequests.create(
      projectId,
      fromBranch,
      toBranch,
      title,
      {
        description,
        removeSourceBranch: false,
      },
    );

    return {
      id: mergeRequest.id,
      number: mergeRequest.iid,
      url: mergeRequest.web_url,
      title: mergeRequest.title,
      sourceBranch: mergeRequest.source_branch,
      targetBranch: mergeRequest.target_branch,
      status: mergeRequest.state,
      hasConflicts: mergeRequest.has_conflicts,
    };
  }

  async checkForConflicts(
    repo: string,
    fromBranch: string,
    toBranch: string,
    token?: string,
  ): Promise<ConflictCheckResult> {
    const projectId = repo;

    try {
      const comparison = await (this.gitlabClient as any).gitlab.Repositories.compare(
        projectId,
        toBranch,
        fromBranch,
      );

      const tempMr = await (this.gitlabClient as any).gitlab.MergeRequests.create(
        projectId,
        fromBranch,
        toBranch,
        `[TEMP] Conflict check ${fromBranch} -> ${toBranch}`,
        {
          description: 'Temporary MR for conflict detection',
        },
      );

      const mrDetails = await (this.gitlabClient as any).gitlab.MergeRequests.show(
        projectId,
        tempMr.iid,
      );

      await (this.gitlabClient as any).gitlab.MergeRequests.remove(
        projectId,
        tempMr.iid,
      );

      return {
        hasConflicts: mrDetails.has_conflicts === true,
        canAutoMerge: mrDetails.merge_status === 'can_be_merged',
        conflictingFiles: mrDetails.has_conflicts
          ? comparison.diffs?.map((d: any) => d.new_path)
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
    const projectId = repo;

    // For GitLab, we'll need to create a new client instance if token is provided
    // This is a placeholder - actual implementation depends on gitlab client structure
    const mergeRequest = await (this.gitlabClient as any).gitlab.MergeRequests.show(
      projectId,
      prNumber,
    );

    return {
      id: mergeRequest.id,
      number: mergeRequest.iid,
      url: mergeRequest.web_url,
      title: mergeRequest.title,
      sourceBranch: mergeRequest.source_branch,
      targetBranch: mergeRequest.target_branch,
      status: mergeRequest.state,
      hasConflicts: mergeRequest.has_conflicts,
    };
  }

  async listPullRequests(
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open',
    token?: string,
  ): Promise<PullRequestResult[]> {
    const projectId = repo;

    const stateMap = {
      open: 'opened',
      closed: 'closed',
      all: 'all',
    };

    const mergeRequests = await (this.gitlabClient as any).gitlab.MergeRequests.all({
      projectId,
      state: stateMap[state],
      perPage: 100,
    });

    return mergeRequests.map((mr: any) => ({
      id: mr.id,
      number: mr.iid,
      url: mr.web_url,
      title: mr.title,
      sourceBranch: mr.source_branch,
      targetBranch: mr.target_branch,
      status: mr.state,
      hasConflicts: mr.has_conflicts,
    }));
  }

  async getPullRequestDiff(
    repo: string,
    prNumber: number,
    token?: string,
  ): Promise<string> {
    const projectId = repo;

    const diffs = await (this.gitlabClient as any).gitlab.MergeRequests.allDiffs(
      projectId,
      prNumber,
    );

    return diffs.map((diff: any) => diff.diff).join('\n');
  }

  async getPullRequestChanges(
    repo: string,
    prNumber: number,
    token?: string,
  ): Promise<PullRequestDiff[]> {
    const projectId = repo;

    const changes = await (this.gitlabClient as any).gitlab.MergeRequests.changes(
      projectId,
      prNumber,
    );

    return changes.changes.map((change: any) => ({
      oldPath: change.old_path,
      newPath: change.new_path,
      diff: change.diff || '',
      newFile: change.new_file,
      deletedFile: change.deleted_file,
      renamedFile: change.renamed_file,
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
    const projectId = repo;

    try {
      const discussionData = {
        body,
        position: {
          base_sha: position.baseSha,
          start_sha: position.startSha,
          head_sha: position.headSha,
          old_path: position.oldPath,
          new_path: position.newPath,
          position_type: 'text',
          old_line: position.oldLine,
          new_line: position.newLine,
        },
      };

      const discussion = await (this.gitlabClient as any).gitlab.MergeRequestDiscussions.create(
        projectId,
        prNumber,
        discussionData,
      );

      const note = discussion.notes?.[0];
      return {
        id: note?.id?.toString() || discussion.id,
        url: note?.url,
        body: note?.body || body,
        createdAt: new Date(note?.created_at || discussion.created_at),
      };
    } catch (error) {
      this.logger.error(
        `Failed to create inline comment for MR #${prNumber}`,
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
    const results: CommentResult[] = [];

    for (const comment of comments) {
      try {
        const result = await this.createInlineComment(
          repo,
          prNumber,
          comment.body,
          comment.path,
          comment.position,
        );
        results.push(result);

        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        this.logger.error(
          `Failed to create comment for ${comment.path}:${comment.position.newLine}`,
          error,
        );
      }
    }

    return results;
  }

  async getCommentPosition(
    repo: string,
    prNumber: number,
    path: string,
    lineNumber: number,
    token?: string,
  ): Promise<DiffPosition | null> {
    const projectId = repo;

    try {
      const versions = await (this.gitlabClient as any).gitlab.MergeRequests.versions(
        projectId,
        prNumber,
      );

      if (!versions || versions.length === 0) {
        return null;
      }

      const latestVersion = versions[0];

      return {
        baseSha: latestVersion.base_commit_sha,
        startSha: latestVersion.start_commit_sha,
        headSha: latestVersion.head_commit_sha,
        newPath: path,
        newLine: lineNumber,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get comment position for MR #${prNumber}`,
        error,
      );
      return null;
    }
  }
}