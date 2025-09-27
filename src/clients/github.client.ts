import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getOctokit } from './octokit.wrapper';

@Injectable()
export class GithubClient implements OnModuleInit {
  private readonly logger = new Logger(GithubClient.name);
  private octokit: any;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const Octokit = await getOctokit();
    this.octokit = new Octokit({
      auth: this.configService.get('github.token'),
    });
  }

  async getOpenPullRequests(owner: string, repo: string) {
    try {
      const { data: pullRequests } = await this.octokit.pulls.list({
        owner,
        repo,
        state: 'open',
        sort: 'created',
        direction: 'desc',
        per_page: 100,
      });

      return pullRequests.map((pr: any) => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        description: pr.body,
        state: pr.state,
        url: pr.html_url,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        author: {
          login: pr.user?.login,
          avatarUrl: pr.user?.avatar_url,
        },
        head: {
          ref: pr.head.ref,
          sha: pr.head.sha,
        },
        base: {
          ref: pr.base.ref,
          sha: pr.base.sha,
        },
        labels: pr.labels.map((label: any) => ({
          name: label.name,
          color: label.color,
        })),
        reviewers: pr.requested_reviewers?.map((reviewer: any) => ({
          login: reviewer.login,
          avatarUrl: reviewer.avatar_url,
        })),
        draft: pr.draft,
        mergeable: pr.mergeable,
        additions: pr.additions,
        deletions: pr.deletions,
        changedFiles: pr.changed_files,
      }));
    } catch (error) {
      this.logger.error(`Failed to fetch open PRs for ${owner}/${repo}`, error);
      throw error;
    }
  }

  async getPullRequestDiff(owner: string, repo: string, pullNumber: number) {
    try {
      const { data: diff } = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
        mediaType: {
          format: 'diff',
        },
      });
      return diff;
    } catch (error) {
      this.logger.error(
        `Failed to fetch PR diff for ${owner}/${repo}#${pullNumber}`,
        error,
      );
      throw error;
    }
  }

  async mergePullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    mergeOptions?: any,
  ) {
    try {
      const { data } = await this.octokit.pulls.merge({
        owner,
        repo,
        pull_number: pullNumber,
        ...mergeOptions,
      });
      return data;
    } catch (error) {
      this.logger.error(
        `Failed to merge PR ${owner}/${repo}#${pullNumber}`,
        error,
      );
      throw error;
    }
  }

  async getRepositoryInfo(owner: string, repo: string) {
    try {
      const { data } = await this.octokit.repos.get({
        owner,
        repo,
      });

      return {
        id: data.id,
        name: data.name,
        fullName: data.full_name,
        description: data.description,
        private: data.private,
        defaultBranch: data.default_branch,
        language: data.language,
        stargazersCount: data.stargazers_count,
        forksCount: data.forks_count,
        openIssuesCount: data.open_issues_count,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        pushedAt: data.pushed_at,
        topics: data.topics,
        visibility: data.visibility,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch repository info for ${owner}/${repo}`,
        error,
      );
      throw error;
    }
  }

  async getMyRepositories() {
    try {
      const { data: repositories } =
        await this.octokit.repos.listForAuthenticatedUser({
          type: 'owner',
          sort: 'updated',
          per_page: 100,
        });

      return repositories.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        private: repo.private,
        fork: repo.fork,
        createdAt: repo.created_at,
        updatedAt: repo.updated_at,
        pushedAt: repo.pushed_at,
        language: repo.language,
        defaultBranch: repo.default_branch,
        openIssuesCount: repo.open_issues_count,
      }));
    } catch (error) {
      this.logger.error(
        'Failed to fetch authenticated user repositories',
        error,
      );
      throw error;
    }
  }

  async getMyPullRequests() {
    try {
      const { data } = await this.octokit.search.issuesAndPullRequests({
        q: 'is:pr author:@me state:open',
        sort: 'updated',
        order: 'desc',
        per_page: 100,
      });

      return data.items.map((pr: any) => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        state: pr.state,
        repository: pr.repository_url?.split('/').slice(-2).join('/'),
        url: pr.html_url,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
      }));
    } catch (error) {
      this.logger.error('Failed to fetch authenticated user PRs', error);
      throw error;
    }
  }

  async createIssue(owner: string, repo: string, issueData: any) {
    try {
      const { data } = await this.octokit.issues.create({
        owner,
        repo,
        ...issueData,
      });

      return {
        id: data.id,
        number: data.number,
        title: data.title,
        body: data.body,
        state: data.state,
        url: data.html_url,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      this.logger.error(`Failed to create issue in ${owner}/${repo}`, error);
      throw error;
    }
  }

  async getWorkflowRuns(owner: string, repo: string, workflowId?: number) {
    try {
      const params: any = {
        owner,
        repo,
        per_page: 50,
      };

      if (workflowId) {
        params.workflow_id = workflowId;
      }

      const { data } = await this.octokit.actions.listWorkflowRuns(params);

      return data.workflow_runs.map((run: any) => ({
        id: run.id,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        workflowId: run.workflow_id,
        branch: run.head_branch,
        event: run.event,
        sha: run.head_sha,
        runNumber: run.run_number,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        url: run.html_url,
      }));
    } catch (error) {
      this.logger.error(
        `Failed to fetch workflow runs for ${owner}/${repo}`,
        error,
      );
      throw error;
    }
  }
}