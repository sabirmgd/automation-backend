import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  IGitProvider,
  CreateRepositoryOptions,
  CloneOptions,
  Branch,
  Tag,
  Commit,
  FileContent,
  PullRequest,
  Issue,
  IssueUpdate,
  UserInfo,
  Organization,
} from '../interfaces/git-provider.interface';
import { GitRepository, GitProvider, RepositoryVisibility } from '../entities/git-repository.entity';
import { GitCredential } from '../entities/git-credential.entity';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface GitLabRepository {
  id: number;
  name: string;
  description: string;
  web_url: string;
  http_url_to_repo: string;
  ssh_url_to_repo: string;
  default_branch: string;
  namespace: {
    full_path: string;
  };
  visibility: string;
  star_count: number;
  forks_count: number;
  open_issues_count: number;
  last_activity_at?: string;
  topics?: string[];
  forked_from_project?: any;
}

interface GitLabBranch {
  name: string;
  commit: {
    id: string;
    web_url: string;
  };
  protected: boolean;
  default?: boolean;
}

interface GitLabTag {
  name: string;
  commit: {
    id: string;
    web_url: string;
  };
  message: string;
}

interface GitLabCommit {
  id: string;
  message: string;
  author_name: string;
  author_email: string;
  authored_date: string;
  web_url: string;
}

interface GitLabFile {
  file_path: string;
  content: string;
  encoding: string;
  size: number;
  content_sha256: string;
}

interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  description: string;
  state: string;
  source_branch: string;
  target_branch: string;
  author: {
    username: string;
    avatar_url: string;
  };
  created_at: string;
  updated_at: string;
  merged_at?: string;
  web_url: string;
}

interface GitLabIssue {
  id: number;
  iid: number;
  title: string;
  description: string;
  state: string;
  labels: string[];
  assignees?: Array<{ username: string }>;
  author: {
    username: string;
    avatar_url: string;
  };
  created_at: string;
  updated_at: string;
  closed_at?: string;
  web_url: string;
}

interface GitLabUser {
  username: string;
  email: string;
  avatar_url: string;
}

interface GitLabGroup {
  id: number;
  name: string;
  full_name?: string;
  avatar_url: string;
}

@Injectable()
export class GitLabProvider implements IGitProvider {
  public readonly name = 'GitLab';
  public readonly type = GitProvider.GITLAB;

  constructor(private readonly httpService: HttpService) {}

  private getApiUrl(credential: GitCredential): string {
    return credential.baseUrl || 'https://gitlab.com/api/v4';
  }

  private getHeaders(credential: GitCredential): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (credential.encryptedToken) {
      headers['PRIVATE-TOKEN'] = credential.encryptedToken;
    }

    if (credential.metadata?.customHeaders) {
      Object.assign(headers, credential.metadata.customHeaders);
    }

    return headers;
  }

  async authenticate(credential: GitCredential): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.getApiUrl(credential)}/user`, {
          headers: this.getHeaders(credential),
        })
      );
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  async validateCredential(credential: GitCredential): Promise<boolean> {
    return this.authenticate(credential);
  }

  async createRepository(
    options: CreateRepositoryOptions & { defaultBranch?: string },
    credential: GitCredential
  ): Promise<GitRepository> {
    try {
      const data: any = {
        name: options.name,
        description: options.description,
        visibility: options.private ? 'private' : 'public',
        initialize_with_readme: options.autoInit,
        default_branch: options.defaultBranch || 'main',
      };

      if (options.namespace) {
        data.namespace_id = options.namespace;
      }

      const response = await firstValueFrom(
        this.httpService.post(`${this.getApiUrl(credential)}/projects`, data, {
          headers: this.getHeaders(credential),
        })
      );

      const repo = response.data;
      return this.mapToGitRepository(repo, credential);
    } catch (error: any) {
      throw new HttpException(
        `Failed to create GitLab repository: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async getRepository(
    owner: string,
    repo: string,
    credential: GitCredential
  ): Promise<GitRepository> {
    try {
      const projectPath = encodeURIComponent(`${owner}/${repo}`);
      const response = await firstValueFrom(
        this.httpService.get(`${this.getApiUrl(credential)}/projects/${projectPath}`, {
          headers: this.getHeaders(credential),
        })
      );

      return this.mapToGitRepository(response.data, credential);
    } catch (error: any) {
      throw new HttpException(
        `Failed to get GitLab repository: ${error.response?.data?.message || error.message}`,
        HttpStatus.NOT_FOUND
      );
    }
  }

  async listRepositories(
    credential: GitCredential,
    namespace?: string
  ): Promise<GitRepository[]> {
    try {
      const params: any = {
        membership: true,
        per_page: 100,
      };

      if (namespace) {
        params.owned = true;
      }

      const response = await firstValueFrom(
        this.httpService.get(`${this.getApiUrl(credential)}/projects`, {
          headers: this.getHeaders(credential),
          params,
        })
      );

      return response.data.map((repo: GitLabRepository) =>
        this.mapToGitRepository(repo, credential)
      );
    } catch (error: any) {
      throw new HttpException(
        `Failed to list GitLab repositories: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async deleteRepository(repoId: string, credential: GitCredential): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.delete(`${this.getApiUrl(credential)}/projects/${repoId}`, {
          headers: this.getHeaders(credential),
        })
      );
    } catch (error: any) {
      throw new HttpException(
        `Failed to delete GitLab repository: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async cloneRepository(repo: GitRepository, options: CloneOptions): Promise<void> {
    try {
      const cloneUrl = repo.credential?.encryptedToken
        ? repo.cloneUrl.replace('https://', `https://oauth2:${repo.credential.encryptedToken}@`)
        : repo.sshUrl || repo.cloneUrl;

      const args = ['clone', cloneUrl, options.localPath];

      if (options.branch) {
        args.push('-b', options.branch);
      }

      if (options.depth) {
        args.push('--depth', options.depth.toString());
      }

      if (options.recursive) {
        args.push('--recursive');
      }

      await execAsync(`git ${args.join(' ')}`);
    } catch (error: any) {
      throw new HttpException(
        `Failed to clone repository: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async pullChanges(repo: GitRepository, branch?: string): Promise<void> {
    try {
      if (!repo.localPath) {
        throw new Error('Local path not set for repository');
      }

      const commands = [
        `cd ${repo.localPath}`,
        branch ? `git checkout ${branch}` : '',
        'git pull',
      ].filter(Boolean);

      await execAsync(commands.join(' && '));
    } catch (error: any) {
      throw new HttpException(
        `Failed to pull changes: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async pushChanges(repo: GitRepository, branch?: string, message?: string): Promise<void> {
    try {
      if (!repo.localPath) {
        throw new Error('Local path not set for repository');
      }

      const commands = [
        `cd ${repo.localPath}`,
        'git add .',
        `git commit -m "${message || 'Update from automation'}"`,
        branch ? `git push origin ${branch}` : 'git push',
      ];

      await execAsync(commands.join(' && '));
    } catch (error: any) {
      throw new HttpException(
        `Failed to push changes: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async getBranches(repo: GitRepository, credential: GitCredential): Promise<any[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.getApiUrl(credential)}/projects/${repo.remoteId}/repository/branches`,
          {
            headers: this.getHeaders(credential),
          }
        )
      );

      return response.data.map((branch: GitLabBranch) => ({
        name: branch.name,
        commit: {
          sha: branch.commit.id,
          url: branch.commit.web_url,
        },
        protected: branch.protected,
        isDefault: branch.default,
      }));
    } catch (error: any) {
      throw new HttpException(
        `Failed to get branches: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async createBranch(
    repo: GitRepository,
    branchName: string,
    fromBranch: string,
    credential: GitCredential
  ): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.getApiUrl(credential)}/projects/${repo.remoteId}/repository/branches`,
          { branch: branchName, ref: fromBranch },
          { headers: this.getHeaders(credential) }
        )
      );

      const branch = response.data;
      return {
        name: branch.name,
        commit: {
          sha: branch.commit.id,
          url: branch.commit.web_url,
        },
        protected: branch.protected,
      };
    } catch (error: any) {
      throw new HttpException(
        `Failed to create branch: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async deleteBranch(
    repo: GitRepository,
    branchName: string,
    credential: GitCredential
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.delete(
          `${this.getApiUrl(credential)}/projects/${repo.remoteId}/repository/branches/${branchName}`,
          { headers: this.getHeaders(credential) }
        )
      );
    } catch (error: any) {
      throw new HttpException(
        `Failed to delete branch: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async getTags(repo: GitRepository, credential: GitCredential): Promise<any[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.getApiUrl(credential)}/projects/${repo.remoteId}/repository/tags`,
          {
            headers: this.getHeaders(credential),
          }
        )
      );

      return response.data.map((tag: GitLabTag) => ({
        name: tag.name,
        commit: {
          sha: tag.commit.id,
          url: tag.commit.web_url,
        },
        message: tag.message,
      }));
    } catch (error: any) {
      throw new HttpException(
        `Failed to get tags: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async createTag(
    repo: GitRepository,
    tagName: string,
    sha: string,
    credential: GitCredential,
    message?: string
  ): Promise<any> {
    try {
      const data: any = {
        tag_name: tagName,
        ref: sha,
      };

      if (message) {
        data.message = message;
      }

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.getApiUrl(credential)}/projects/${repo.remoteId}/repository/tags`,
          data,
          { headers: this.getHeaders(credential) }
        )
      );

      const tag = response.data;
      return {
        name: tag.name,
        commit: {
          sha: tag.commit.id,
          url: tag.commit.web_url,
        },
        message: tag.message,
      };
    } catch (error: any) {
      throw new HttpException(
        `Failed to create tag: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async deleteTag(
    repo: GitRepository,
    tagName: string,
    credential: GitCredential
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.delete(
          `${this.getApiUrl(credential)}/projects/${repo.remoteId}/repository/tags/${tagName}`,
          { headers: this.getHeaders(credential) }
        )
      );
    } catch (error: any) {
      throw new HttpException(
        `Failed to delete tag: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async getCommits(
    repo: GitRepository,
    credential: GitCredential,
    branch?: string,
    limit?: number
  ): Promise<any[]> {
    try {
      const params: any = {
        per_page: limit || 100,
      };

      if (branch) {
        params.ref_name = branch;
      }

      const response = await firstValueFrom(
        this.httpService.get(
          `${this.getApiUrl(credential)}/projects/${repo.remoteId}/repository/commits`,
          {
            headers: this.getHeaders(credential),
            params,
          }
        )
      );

      return response.data.map((commit: GitLabCommit) => ({
        sha: commit.id,
        message: commit.message,
        author: {
          name: commit.author_name,
          email: commit.author_email,
          date: new Date(commit.authored_date),
        },
        url: commit.web_url,
      }));
    } catch (error: any) {
      throw new HttpException(
        `Failed to get commits: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async getCommit(
    repo: GitRepository,
    sha: string,
    credential: GitCredential
  ): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.getApiUrl(credential)}/projects/${repo.remoteId}/repository/commits/${sha}`,
          {
            headers: this.getHeaders(credential),
          }
        )
      );

      const commit = response.data;
      return {
        sha: commit.id,
        message: commit.message,
        author: {
          name: commit.author_name,
          email: commit.author_email,
          date: new Date(commit.authored_date),
        },
        url: commit.web_url,
      };
    } catch (error: any) {
      throw new HttpException(
        `Failed to get commit: ${error.response?.data?.message || error.message}`,
        HttpStatus.NOT_FOUND
      );
    }
  }

  async getFile(
    repo: GitRepository,
    filePath: string,
    credential: GitCredential,
    branch?: string
  ): Promise<any> {
    try {
      const encodedPath = encodeURIComponent(filePath);
      const params: any = {};

      if (branch) {
        params.ref = branch;
      }

      const response = await firstValueFrom(
        this.httpService.get(
          `${this.getApiUrl(credential)}/projects/${repo.remoteId}/repository/files/${encodedPath}`,
          { headers: this.getHeaders(credential), params }
        )
      );

      const file = response.data;
      return {
        path: file.file_path,
        content: Buffer.from(file.content, 'base64').toString('utf-8'),
        encoding: file.encoding,
        size: file.size,
        sha: file.content_sha256,
      };
    } catch (error: any) {
      throw new HttpException(
        `Failed to get file: ${error.response?.data?.message || error.message}`,
        HttpStatus.NOT_FOUND
      );
    }
  }

  async createFile(
    repo: GitRepository,
    filePath: string,
    content: string,
    message: string,
    credential: GitCredential,
    branch?: string
  ): Promise<void> {
    try {
      const encodedPath = encodeURIComponent(filePath);
      const data = {
        branch: branch || repo.defaultBranch || 'main',
        content: Buffer.from(content).toString('base64'),
        commit_message: message,
        encoding: 'base64',
      };

      await firstValueFrom(
        this.httpService.post(
          `${this.getApiUrl(credential)}/projects/${repo.remoteId}/repository/files/${encodedPath}`,
          data,
          { headers: this.getHeaders(credential) }
        )
      );
    } catch (error: any) {
      throw new HttpException(
        `Failed to create file: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async updateFile(
    repo: GitRepository,
    filePath: string,
    content: string,
    message: string,
    sha: string,
    credential: GitCredential,
    branch?: string
  ): Promise<void> {
    try {
      const encodedPath = encodeURIComponent(filePath);
      const data = {
        branch: branch || repo.defaultBranch || 'main',
        content: Buffer.from(content).toString('base64'),
        commit_message: message,
        encoding: 'base64',
      };

      await firstValueFrom(
        this.httpService.put(
          `${this.getApiUrl(credential)}/projects/${repo.remoteId}/repository/files/${encodedPath}`,
          data,
          { headers: this.getHeaders(credential) }
        )
      );
    } catch (error: any) {
      throw new HttpException(
        `Failed to update file: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async deleteFile(
    repo: GitRepository,
    filePath: string,
    message: string,
    sha: string,
    credential: GitCredential,
    branch?: string
  ): Promise<void> {
    try {
      const encodedPath = encodeURIComponent(filePath);
      const data = {
        branch: branch || repo.defaultBranch || 'main',
        commit_message: message,
      };

      await firstValueFrom(
        this.httpService.delete(
          `${this.getApiUrl(credential)}/projects/${repo.remoteId}/repository/files/${encodedPath}`,
          { headers: this.getHeaders(credential), data }
        )
      );
    } catch (error: any) {
      throw new HttpException(
        `Failed to delete file: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async listPullRequests(
    repo: GitRepository,
    credential: GitCredential,
    state?: string
  ): Promise<any[]> {
    try {
      const params: any = {
        per_page: 100,
      };

      if (state && state !== 'all') {
        params.state = state === 'open' ? 'opened' : 'closed';
      }

      const response = await firstValueFrom(
        this.httpService.get(
          `${this.getApiUrl(credential)}/projects/${repo.remoteId}/merge_requests`,
          {
            headers: this.getHeaders(credential),
            params,
          }
        )
      );

      return response.data.map((mr: GitLabMergeRequest) => ({
        id: mr.id.toString(),
        number: mr.iid,
        title: mr.title,
        description: mr.description,
        state:
          mr.state === 'opened'
            ? 'open'
            : mr.state === 'merged'
            ? 'merged'
            : 'closed',
        sourceBranch: mr.source_branch,
        targetBranch: mr.target_branch,
        author: {
          username: mr.author.username,
          avatarUrl: mr.author.avatar_url,
        },
        createdAt: new Date(mr.created_at),
        updatedAt: new Date(mr.updated_at),
        mergedAt: mr.merged_at ? new Date(mr.merged_at) : undefined,
        url: mr.web_url,
      }));
    } catch (error: any) {
      throw new HttpException(
        `Failed to list merge requests: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async createPullRequest(
    repo: GitRepository,
    title: string,
    sourceBranch: string,
    targetBranch: string,
    credential: GitCredential,
    description?: string
  ): Promise<any> {
    try {
      const data = {
        source_branch: sourceBranch,
        target_branch: targetBranch,
        title,
        description,
      };

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.getApiUrl(credential)}/projects/${repo.remoteId}/merge_requests`,
          data,
          { headers: this.getHeaders(credential) }
        )
      );

      const mr = response.data;
      return {
        id: mr.id.toString(),
        number: mr.iid,
        title: mr.title,
        description: mr.description,
        state:
          mr.state === 'opened'
            ? 'open'
            : mr.state === 'merged'
            ? 'merged'
            : 'closed',
        sourceBranch: mr.source_branch,
        targetBranch: mr.target_branch,
        author: {
          username: mr.author.username,
          avatarUrl: mr.author.avatar_url,
        },
        createdAt: new Date(mr.created_at),
        updatedAt: new Date(mr.updated_at),
        mergedAt: mr.merged_at ? new Date(mr.merged_at) : undefined,
        url: mr.web_url,
      };
    } catch (error: any) {
      throw new HttpException(
        `Failed to create merge request: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async mergePullRequest(
    repo: GitRepository,
    prNumber: number,
    credential: GitCredential,
    method?: string
  ): Promise<void> {
    try {
      const data: any = {};

      if (method === 'squash') {
        data.squash = true;
      } else if (method === 'rebase') {
        data.merge_when_pipeline_succeeds = false;
        data.should_remove_source_branch = true;
      }

      await firstValueFrom(
        this.httpService.put(
          `${this.getApiUrl(credential)}/projects/${repo.remoteId}/merge_requests/${prNumber}/merge`,
          data,
          { headers: this.getHeaders(credential) }
        )
      );
    } catch (error: any) {
      throw new HttpException(
        `Failed to merge request: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async listIssues(
    repo: GitRepository,
    credential: GitCredential,
    state?: string,
    labels?: string[]
  ): Promise<any[]> {
    try {
      const params: any = {
        per_page: 100,
      };

      if (state && state !== 'all') {
        params.state = state === 'open' ? 'opened' : 'closed';
      }

      if (labels && labels.length > 0) {
        params.labels = labels.join(',');
      }

      const response = await firstValueFrom(
        this.httpService.get(
          `${this.getApiUrl(credential)}/projects/${repo.remoteId}/issues`,
          {
            headers: this.getHeaders(credential),
            params,
          }
        )
      );

      return response.data.map((issue: GitLabIssue) => ({
        id: issue.id.toString(),
        number: issue.iid,
        title: issue.title,
        body: issue.description,
        state: issue.state === 'opened' ? 'open' : 'closed',
        labels: issue.labels,
        assignees: issue.assignees?.map((a) => a.username) || [],
        author: {
          username: issue.author.username,
          avatarUrl: issue.author.avatar_url,
        },
        createdAt: new Date(issue.created_at),
        updatedAt: new Date(issue.updated_at),
        closedAt: issue.closed_at ? new Date(issue.closed_at) : undefined,
        url: issue.web_url,
      }));
    } catch (error: any) {
      throw new HttpException(
        `Failed to list issues: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async createIssue(
    repo: GitRepository,
    title: string,
    credential: GitCredential,
    body?: string,
    labels?: string[],
    assignees?: string[]
  ): Promise<any> {
    try {
      const data: any = {
        title,
        description: body,
      };

      if (labels && labels.length > 0) {
        data.labels = labels.join(',');
      }

      if (assignees && assignees.length > 0) {
        const userIds = await this.getUserIds(assignees, credential);
        data.assignee_ids = userIds;
      }

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.getApiUrl(credential)}/projects/${repo.remoteId}/issues`,
          data,
          { headers: this.getHeaders(credential) }
        )
      );

      const issue = response.data;
      return {
        id: issue.id.toString(),
        number: issue.iid,
        title: issue.title,
        body: issue.description,
        state: issue.state === 'opened' ? 'open' : 'closed',
        labels: issue.labels,
        assignees: issue.assignees?.map((a: any) => a.username) || [],
        author: {
          username: issue.author.username,
          avatarUrl: issue.author.avatar_url,
        },
        createdAt: new Date(issue.created_at),
        updatedAt: new Date(issue.updated_at),
        closedAt: issue.closed_at ? new Date(issue.closed_at) : undefined,
        url: issue.web_url,
      };
    } catch (error: any) {
      throw new HttpException(
        `Failed to create issue: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async updateIssue(
    repo: GitRepository,
    issueNumber: number,
    updates: any,
    credential: GitCredential
  ): Promise<any> {
    try {
      const data: any = {};

      if (updates.title) data.title = updates.title;
      if (updates.body) data.description = updates.body;
      if (updates.state) data.state_event = updates.state === 'closed' ? 'close' : 'reopen';
      if (updates.labels) data.labels = updates.labels.join(',');

      const response = await firstValueFrom(
        this.httpService.put(
          `${this.getApiUrl(credential)}/projects/${repo.remoteId}/issues/${issueNumber}`,
          data,
          { headers: this.getHeaders(credential) }
        )
      );

      const issue = response.data;
      return {
        id: issue.id.toString(),
        number: issue.iid,
        title: issue.title,
        body: issue.description,
        state: issue.state === 'opened' ? 'open' : 'closed',
        labels: issue.labels,
        assignees: issue.assignees?.map((a: any) => a.username) || [],
        author: {
          username: issue.author.username,
          avatarUrl: issue.author.avatar_url,
        },
        createdAt: new Date(issue.created_at),
        updatedAt: new Date(issue.updated_at),
        closedAt: issue.closed_at ? new Date(issue.closed_at) : undefined,
        url: issue.web_url,
      };
    } catch (error: any) {
      throw new HttpException(
        `Failed to update issue: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async createWebhook(
    repo: GitRepository,
    url: string,
    events: string[],
    credential: GitCredential,
    secret?: string
  ): Promise<string> {
    try {
      const gitlabEvents = this.mapWebhookEvents(events);
      const data: any = {
        url,
        ...gitlabEvents,
      };

      if (secret) {
        data.token = secret;
      }

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.getApiUrl(credential)}/projects/${repo.remoteId}/hooks`,
          data,
          { headers: this.getHeaders(credential) }
        )
      );

      return response.data.id.toString();
    } catch (error: any) {
      throw new HttpException(
        `Failed to create webhook: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async deleteWebhook(
    repo: GitRepository,
    webhookId: string,
    credential: GitCredential
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.delete(
          `${this.getApiUrl(credential)}/projects/${repo.remoteId}/hooks/${webhookId}`,
          { headers: this.getHeaders(credential) }
        )
      );
    } catch (error: any) {
      throw new HttpException(
        `Failed to delete webhook: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async searchRepositories(
    query: string,
    credential: GitCredential,
    limit?: number
  ): Promise<GitRepository[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.getApiUrl(credential)}/projects`, {
          headers: this.getHeaders(credential),
          params: {
            search: query,
            per_page: limit || 100,
          },
        })
      );

      return response.data.map((repo: GitLabRepository) =>
        this.mapToGitRepository(repo, credential)
      );
    } catch (error: any) {
      throw new HttpException(
        `Failed to search repositories: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async getUserInfo(credential: GitCredential): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.getApiUrl(credential)}/user`, {
          headers: this.getHeaders(credential),
        })
      );

      return {
        username: response.data.username,
        email: response.data.email,
        avatarUrl: response.data.avatar_url,
      };
    } catch (error: any) {
      throw new HttpException(
        `Failed to get user info: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async getOrganizations(credential: GitCredential): Promise<any[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.getApiUrl(credential)}/groups`, {
          headers: this.getHeaders(credential),
          params: {
            min_access_level: 10,
            per_page: 100,
          },
        })
      );

      return response.data.map((group: GitLabGroup) => ({
        id: group.id.toString(),
        name: group.full_name || group.name,
        avatarUrl: group.avatar_url,
      }));
    } catch (error: any) {
      throw new HttpException(
        `Failed to get organizations: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  private mapToGitRepository(gitlabRepo: GitLabRepository, credential: GitCredential): GitRepository {
    const repo = new GitRepository();
    repo.provider = GitProvider.GITLAB;
    repo.name = gitlabRepo.name;
    repo.description = gitlabRepo.description;
    repo.url = gitlabRepo.web_url;
    repo.cloneUrl = gitlabRepo.http_url_to_repo;
    repo.sshUrl = gitlabRepo.ssh_url_to_repo;
    repo.defaultBranch = gitlabRepo.default_branch;
    repo.remoteId = gitlabRepo.id.toString();
    repo.namespace = gitlabRepo.namespace.full_path;
    repo.visibility = this.mapVisibility(gitlabRepo.visibility);
    repo.credentialId = credential.id;
    repo.isForked = gitlabRepo.forked_from_project !== undefined;
    repo.metadata = {
      stars: gitlabRepo.star_count,
      forks: gitlabRepo.forks_count,
      openIssues: gitlabRepo.open_issues_count,
      lastCommitAt: gitlabRepo.last_activity_at
        ? new Date(gitlabRepo.last_activity_at)
        : undefined,
      topics: gitlabRepo.topics || [],
    };

    return repo;
  }

  private mapVisibility(visibility: string): RepositoryVisibility {
    switch (visibility) {
      case 'public':
        return RepositoryVisibility.PUBLIC;
      case 'internal':
        return RepositoryVisibility.INTERNAL;
      case 'private':
      default:
        return RepositoryVisibility.PRIVATE;
    }
  }

  private mapWebhookEvents(events: string[]): Record<string, boolean> {
    const eventMap: Record<string, string> = {
      push: 'push_events',
      issues: 'issues_events',
      merge_requests: 'merge_requests_events',
      wiki: 'wiki_page_events',
      pipeline: 'pipeline_events',
      job: 'job_events',
      deployment: 'deployment_events',
      release: 'releases_events',
    };

    const result: Record<string, boolean> = {};
    for (const event of events) {
      if (eventMap[event]) {
        result[eventMap[event]] = true;
      }
    }

    return result;
  }

  private async getUserIds(usernames: string[], credential: GitCredential): Promise<number[]> {
    const userIds: number[] = [];

    for (const username of usernames) {
      try {
        const response = await firstValueFrom(
          this.httpService.get(`${this.getApiUrl(credential)}/users`, {
            headers: this.getHeaders(credential),
            params: { username },
          })
        );

        if (response.data.length > 0) {
          userIds.push(response.data[0].id);
        }
      } catch (error) {
        console.error(`Failed to get user ID for ${username}:`, error);
      }
    }

    return userIds;
  }
}