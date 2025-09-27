import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Gitlab } from '@gitbeaker/rest';

@Injectable()
export class GitlabClient {
  private readonly logger = new Logger(GitlabClient.name);
  private readonly gitlab: any;

  constructor(private readonly configService: ConfigService) {
    this.gitlab = new Gitlab({
      host: this.configService.get('gitlab.host', 'https://gitlab.com'),
      token: this.configService.get('gitlab.token'),
    });
  }

  async getOpenMergeRequests(projectId: number | string) {
    try {
      const mergeRequests = await this.gitlab.MergeRequests.all({
        projectId,
        state: 'opened',
        orderBy: 'created_at',
        sort: 'desc',
        perPage: 100,
      });

      return mergeRequests.map((mr: any) => ({
        id: mr.id,
        iid: mr.iid,
        title: mr.title,
        description: mr.description,
        state: mr.state,
        webUrl: mr.web_url,
        createdAt: mr.created_at,
        updatedAt: mr.updated_at,
        mergedAt: mr.merged_at,
        author: {
          id: mr.author.id,
          username: mr.author.username,
          name: mr.author.name,
          avatarUrl: mr.author.avatar_url,
        },
        assignee: mr.assignee
          ? {
              id: mr.assignee.id,
              username: mr.assignee.username,
              name: mr.assignee.name,
            }
          : null,
        sourceBranch: mr.source_branch,
        targetBranch: mr.target_branch,
        sourceProjectId: mr.source_project_id,
        targetProjectId: mr.target_project_id,
        labels: mr.labels,
        draft: mr.draft || mr.work_in_progress,
        mergeable: mr.has_conflicts === false,
        changes: {
          additions: mr.changes_count,
          deletions: mr.user_notes_count,
        },
        upvotes: mr.upvotes,
        downvotes: mr.downvotes,
        reviewers: mr.reviewers?.map((reviewer: any) => ({
          id: reviewer.id,
          username: reviewer.username,
          name: reviewer.name,
        })),
      }));
    } catch (error) {
      this.logger.error(
        `Failed to fetch open MRs for project ${projectId}`,
        error,
      );
      throw error;
    }
  }

  async getMergeRequestDiff(
    projectId: number | string,
    mergeRequestIid: number,
  ) {
    try {
      const diffs = await this.gitlab.MergeRequests.allDiffs(
        projectId,
        mergeRequestIid,
      );

      return {
        mergeRequestIid,
        diffs: diffs.map((diff: any) => ({
          oldPath: diff.old_path,
          newPath: diff.new_path,
          aMode: diff.a_mode,
          bMode: diff.b_mode,
          diff: diff.diff,
          newFile: diff.new_file,
          renamedFile: diff.renamed_file,
          deletedFile: diff.deleted_file,
        })),
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch MR diff for project ${projectId} MR #${mergeRequestIid}`,
        error,
      );
      throw error;
    }
  }

  async getMergeRequestChanges(
    projectId: number | string,
    mergeRequestIid: number,
  ) {
    try {
      const mr = await this.gitlab.MergeRequests.show(
        projectId,
        mergeRequestIid,
      );
      const changes = await this.gitlab.MergeRequests.changes(
        projectId,
        mergeRequestIid,
      );

      return {
        mergeRequestIid,
        title: mr.title,
        changes: changes.changes.map((change: any) => ({
          oldPath: change.old_path,
          newPath: change.new_path,
          diff: change.diff,
          newFile: change.new_file,
          renamedFile: change.renamed_file,
          deletedFile: change.deleted_file,
        })),
        stats: {
          additions: changes.changes.reduce((acc: number, c: any) => {
            const additions = (c.diff?.match(/^\+[^+]/gm) || []).length;
            return acc + additions;
          }, 0),
          deletions: changes.changes.reduce((acc: number, c: any) => {
            const deletions = (c.diff?.match(/^-[^-]/gm) || []).length;
            return acc + deletions;
          }, 0),
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch MR changes for project ${projectId} MR #${mergeRequestIid}`,
        error,
      );
      throw error;
    }
  }

  async getMultipleMergeRequestsDiffs(
    projectId: number | string,
    mergeRequestIids: number[],
  ) {
    try {
      const diffs = await Promise.all(
        mergeRequestIids.map((iid) =>
          this.getMergeRequestDiff(projectId, iid),
        ),
      );
      return diffs;
    } catch (error) {
      this.logger.error(
        `Failed to fetch multiple MR diffs for project ${projectId}`,
        error,
      );
      throw error;
    }
  }

  async getOpenMergeRequestsWithDiffs(projectId: number | string) {
    try {
      const openMRs = await this.getOpenMergeRequests(projectId);
      const mrIids = openMRs.map((mr) => mr.iid);
      const diffs = await this.getMultipleMergeRequestsDiffs(projectId, mrIids);

      return openMRs.map((mr) => ({
        ...mr,
        diffs: diffs.find((d) => d.mergeRequestIid === mr.iid)?.diffs,
      }));
    } catch (error) {
      this.logger.error(
        `Failed to fetch open MRs with diffs for project ${projectId}`,
        error,
      );
      throw error;
    }
  }

  async getMyAssignedMergeRequests() {
    try {
      const currentUser = await this.gitlab.Users.current();
      const mergeRequests = await this.gitlab.MergeRequests.all({
        scope: 'all',
        state: 'opened',
        assigneeId: currentUser.id,
        orderBy: 'updated_at',
        sort: 'desc',
      });

      return mergeRequests.map((mr: any) => ({
        id: mr.id,
        iid: mr.iid,
        title: mr.title,
        projectId: mr.project_id,
        webUrl: mr.web_url,
        sourceBranch: mr.source_branch,
        targetBranch: mr.target_branch,
        state: mr.state,
        createdAt: mr.created_at,
        updatedAt: mr.updated_at,
        author: {
          username: mr.author.username,
          name: mr.author.name,
        },
      }));
    } catch (error) {
      this.logger.error('Failed to fetch assigned MRs', error);
      throw error;
    }
  }
}