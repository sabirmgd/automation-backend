import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  GitRepository,
  GitProvider,
  RepositoryVisibility,
} from '../entities/git-repository.entity';
import { GitCredential } from '../entities/git-credential.entity';
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
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class GitHubProvider implements IGitProvider {
  name = 'GitHub';
  type = GitProvider.GITHUB;

  constructor(private readonly httpService: HttpService) {}

  private getApiUrl(credential: GitCredential): string {
    return credential.baseUrl || 'https://api.github.com';
  }

  private getHeaders(credential: GitCredential): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };

    if (credential.encryptedToken) {
      console.log(
        `[GitHubProvider] Using token that starts with: ${credential.encryptedToken.substring(
          0,
          10,
        )}...`,
      );
      headers['Authorization'] = `Bearer ${credential.encryptedToken}`;
    } else {
      console.log(`[GitHubProvider] No token found in credential!`);
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
        }),
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
    options: CreateRepositoryOptions,
    credential: GitCredential,
  ): Promise<GitRepository> {
    try {
      const endpoint = options.namespace
        ? `${this.getApiUrl(credential)}/orgs/${options.namespace}/repos`
        : `${this.getApiUrl(credential)}/user/repos`;

      const data: any = {
        name: options.name,
        description: options.description,
        private: options.private !== false,
        auto_init: options.autoInit || false,
      };

      if (options.gitignoreTemplate) {
        data.gitignore_template = options.gitignoreTemplate;
      }

      if (options.licenseTemplate) {
        data.license_template = options.licenseTemplate;
      }

      const response = await firstValueFrom(
        this.httpService.post(endpoint, data, {
          headers: this.getHeaders(credential),
        }),
      );

      const repo = response.data;
      return this.mapToGitRepository(repo, credential);
    } catch (error: any) {
      throw new HttpException(
        `Failed to create GitHub repository: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async getRepository(
    owner: string,
    repo: string,
    credential: GitCredential,
  ): Promise<GitRepository> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.getApiUrl(credential)}/repos/${owner}/${repo}`,
          {
            headers: this.getHeaders(credential),
          },
        ),
      );
      return this.mapToGitRepository(response.data, credential);
    } catch (error: any) {
      throw new HttpException(
        `Failed to get GitHub repository: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.NOT_FOUND,
      );
    }
  }

  async listRepositories(
    credential: GitCredential,
    namespace?: string,
  ): Promise<GitRepository[]> {
    try {
      const endpoint = namespace
        ? `${this.getApiUrl(credential)}/orgs/${namespace}/repos`
        : `${this.getApiUrl(credential)}/user/repos`;

      const response = await firstValueFrom(
        this.httpService.get(endpoint, {
          headers: this.getHeaders(credential),
          params: {
            per_page: 100,
            sort: 'updated',
          },
        }),
      );

      return response.data.map((repo: any) =>
        this.mapToGitRepository(repo, credential),
      );
    } catch (error: any) {
      throw new HttpException(
        `Failed to list GitHub repositories: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async deleteRepository(
    repoId: string,
    credential: GitCredential,
  ): Promise<void> {
    try {
      const [owner, name] = repoId.split('/');
      await firstValueFrom(
        this.httpService.delete(
          `${this.getApiUrl(credential)}/repos/${owner}/${name}`,
          {
            headers: this.getHeaders(credential),
          },
        ),
      );
    } catch (error: any) {
      throw new HttpException(
        `Failed to delete GitHub repository: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async cloneRepository(
    repo: GitRepository,
    options: CloneOptions,
  ): Promise<void> {
    try {
      const cloneUrl = repo.credential?.encryptedToken
        ? repo.cloneUrl.replace(
            'https://',
            `https://${repo.credential.encryptedToken}@`,
          )
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
        HttpStatus.BAD_REQUEST,
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
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async pushChanges(
    repo: GitRepository,
    branch?: string,
    message?: string,
  ): Promise<void> {
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
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async getBranches(
    repo: GitRepository,
    credential: GitCredential,
  ): Promise<Branch[]> {
    try {
      const [owner, name] = repo.remoteId.split('/');
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.getApiUrl(credential)}/repos/${owner}/${name}/branches`,
          {
            headers: this.getHeaders(credential),
            params: { per_page: 100 },
          },
        ),
      );

      const defaultBranch = repo.defaultBranch;
      return response.data.map((branch: any) => ({
        name: branch.name,
        commit: {
          sha: branch.commit.sha,
          url: branch.commit.url,
        },
        protected: branch.protected,
        isDefault: branch.name === defaultBranch,
      }));
    } catch (error: any) {
      throw new HttpException(
        `Failed to get branches: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async createBranch(
    repo: GitRepository,
    branchName: string,
    fromBranch: string,
    credential: GitCredential,
  ): Promise<Branch> {
    try {
      const [owner, name] = repo.remoteId.split('/');

      const refResponse = await firstValueFrom(
        this.httpService.get(
          `${this.getApiUrl(
            credential,
          )}/repos/${owner}/${name}/git/ref/heads/${fromBranch}`,
          {
            headers: this.getHeaders(credential),
          },
        ),
      );

      const sha = refResponse.data.object.sha;

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.getApiUrl(credential)}/repos/${owner}/${name}/git/refs`,
          {
            ref: `refs/heads/${branchName}`,
            sha: sha,
          },
          { headers: this.getHeaders(credential) },
        ),
      );

      return {
        name: branchName,
        commit: {
          sha: response.data.object.sha,
          url: response.data.object.url,
        },
        protected: false,
      };
    } catch (error: any) {
      throw new HttpException(
        `Failed to create branch: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async deleteBranch(
    repo: GitRepository,
    branchName: string,
    credential: GitCredential,
  ): Promise<void> {
    try {
      const [owner, name] = repo.remoteId.split('/');
      await firstValueFrom(
        this.httpService.delete(
          `${this.getApiUrl(
            credential,
          )}/repos/${owner}/${name}/git/refs/heads/${branchName}`,
          { headers: this.getHeaders(credential) },
        ),
      );
    } catch (error: any) {
      throw new HttpException(
        `Failed to delete branch: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async getTags(
    repo: GitRepository,
    credential: GitCredential,
  ): Promise<Tag[]> {
    try {
      const [owner, name] = repo.remoteId.split('/');
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.getApiUrl(credential)}/repos/${owner}/${name}/tags`,
          {
            headers: this.getHeaders(credential),
            params: { per_page: 100 },
          },
        ),
      );

      return response.data.map((tag: any) => ({
        name: tag.name,
        commit: {
          sha: tag.commit.sha,
          url: tag.commit.url,
        },
      }));
    } catch (error: any) {
      throw new HttpException(
        `Failed to get tags: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async createTag(
    repo: GitRepository,
    tagName: string,
    sha: string,
    credential: GitCredential,
    message?: string,
  ): Promise<Tag> {
    try {
      const [owner, name] = repo.remoteId.split('/');

      if (message) {
        const tagResponse = await firstValueFrom(
          this.httpService.post(
            `${this.getApiUrl(credential)}/repos/${owner}/${name}/git/tags`,
            {
              tag: tagName,
              message: message,
              object: sha,
              type: 'commit',
            },
            { headers: this.getHeaders(credential) },
          ),
        );

        await firstValueFrom(
          this.httpService.post(
            `${this.getApiUrl(credential)}/repos/${owner}/${name}/git/refs`,
            {
              ref: `refs/tags/${tagName}`,
              sha: tagResponse.data.sha,
            },
            { headers: this.getHeaders(credential) },
          ),
        );

        return {
          name: tagName,
          commit: {
            sha: sha,
            url: `${this.getApiUrl(
              credential,
            )}/repos/${owner}/${name}/commits/${sha}`,
          },
          message: message,
        };
      } else {
        const response = await firstValueFrom(
          this.httpService.post(
            `${this.getApiUrl(credential)}/repos/${owner}/${name}/git/refs`,
            {
              ref: `refs/tags/${tagName}`,
              sha: sha,
            },
            { headers: this.getHeaders(credential) },
          ),
        );

        return {
          name: tagName,
          commit: {
            sha: sha,
            url: `${this.getApiUrl(
              credential,
            )}/repos/${owner}/${name}/commits/${sha}`,
          },
        };
      }
    } catch (error: any) {
      throw new HttpException(
        `Failed to create tag: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async deleteTag(
    repo: GitRepository,
    tagName: string,
    credential: GitCredential,
  ): Promise<void> {
    try {
      const [owner, name] = repo.remoteId.split('/');
      await firstValueFrom(
        this.httpService.delete(
          `${this.getApiUrl(
            credential,
          )}/repos/${owner}/${name}/git/refs/tags/${tagName}`,
          { headers: this.getHeaders(credential) },
        ),
      );
    } catch (error: any) {
      throw new HttpException(
        `Failed to delete tag: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async getCommits(
    repo: GitRepository,
    credential: GitCredential,
    branch?: string,
    limit?: number,
  ): Promise<Commit[]> {
    try {
      const [owner, name] = repo.remoteId.split('/');
      const params: any = {
        per_page: limit || 100,
      };

      if (branch) {
        params.sha = branch;
      }

      const response = await firstValueFrom(
        this.httpService.get(
          `${this.getApiUrl(credential)}/repos/${owner}/${name}/commits`,
          {
            headers: this.getHeaders(credential),
            params,
          },
        ),
      );

      return response.data.map((commit: any) => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: {
          name: commit.commit.author.name,
          email: commit.commit.author.email,
          date: new Date(commit.commit.author.date),
        },
        url: commit.html_url,
      }));
    } catch (error: any) {
      throw new HttpException(
        `Failed to get commits: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async getCommit(
    repo: GitRepository,
    sha: string,
    credential: GitCredential,
  ): Promise<Commit> {
    try {
      const [owner, name] = repo.remoteId.split('/');
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.getApiUrl(credential)}/repos/${owner}/${name}/commits/${sha}`,
          {
            headers: this.getHeaders(credential),
          },
        ),
      );

      const commit = response.data;
      return {
        sha: commit.sha,
        message: commit.commit.message,
        author: {
          name: commit.commit.author.name,
          email: commit.commit.author.email,
          date: new Date(commit.commit.author.date),
        },
        url: commit.html_url,
      };
    } catch (error: any) {
      throw new HttpException(
        `Failed to get commit: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.NOT_FOUND,
      );
    }
  }

  async getFile(
    repo: GitRepository,
    filePath: string,
    credential: GitCredential,
    branch?: string,
  ): Promise<FileContent> {
    try {
      const [owner, name] = repo.remoteId.split('/');
      const params: any = {};

      if (branch) {
        params.ref = branch;
      }

      const response = await firstValueFrom(
        this.httpService.get(
          `${this.getApiUrl(
            credential,
          )}/repos/${owner}/${name}/contents/${filePath}`,
          { headers: this.getHeaders(credential), params },
        ),
      );

      const file = response.data;
      return {
        path: file.path,
        content: Buffer.from(file.content, 'base64').toString('utf-8'),
        encoding: file.encoding,
        size: file.size,
        sha: file.sha,
      };
    } catch (error: any) {
      throw new HttpException(
        `Failed to get file: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.NOT_FOUND,
      );
    }
  }

  async createFile(
    repo: GitRepository,
    filePath: string,
    content: string,
    message: string,
    credential: GitCredential,
    branch?: string,
  ): Promise<void> {
    try {
      const [owner, name] = repo.remoteId.split('/');
      const data: any = {
        message: message,
        content: Buffer.from(content).toString('base64'),
      };

      if (branch) {
        data.branch = branch;
      }

      await firstValueFrom(
        this.httpService.put(
          `${this.getApiUrl(
            credential,
          )}/repos/${owner}/${name}/contents/${filePath}`,
          data,
          { headers: this.getHeaders(credential) },
        ),
      );
    } catch (error: any) {
      throw new HttpException(
        `Failed to create file: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
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
    branch?: string,
  ): Promise<void> {
    try {
      const [owner, name] = repo.remoteId.split('/');
      const data: any = {
        message: message,
        content: Buffer.from(content).toString('base64'),
        sha: sha,
      };

      if (branch) {
        data.branch = branch;
      }

      await firstValueFrom(
        this.httpService.put(
          `${this.getApiUrl(
            credential,
          )}/repos/${owner}/${name}/contents/${filePath}`,
          data,
          { headers: this.getHeaders(credential) },
        ),
      );
    } catch (error: any) {
      throw new HttpException(
        `Failed to update file: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async deleteFile(
    repo: GitRepository,
    filePath: string,
    message: string,
    sha: string,
    credential: GitCredential,
    branch?: string,
  ): Promise<void> {
    try {
      const [owner, name] = repo.remoteId.split('/');
      const data: any = {
        message: message,
        sha: sha,
      };

      if (branch) {
        data.branch = branch;
      }

      await firstValueFrom(
        this.httpService.delete(
          `${this.getApiUrl(
            credential,
          )}/repos/${owner}/${name}/contents/${filePath}`,
          { headers: this.getHeaders(credential), data },
        ),
      );
    } catch (error: any) {
      throw new HttpException(
        `Failed to delete file: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async listPullRequests(
    repo: GitRepository,
    credential: GitCredential,
    state?: string,
  ): Promise<PullRequest[]> {
    try {
      const [owner, name] = repo.remoteId.split('/');
      const params = {
        per_page: 100,
        state: state || 'open',
      };

      const response = await firstValueFrom(
        this.httpService.get(
          `${this.getApiUrl(credential)}/repos/${owner}/${name}/pulls`,
          {
            headers: this.getHeaders(credential),
            params,
          },
        ),
      );

      return response.data.map((pr: any) => ({
        id: pr.id.toString(),
        number: pr.number,
        title: pr.title,
        description: pr.body,
        state: pr.state === 'open' ? 'open' : pr.merged ? 'merged' : 'closed',
        sourceBranch: pr.head?.ref || `deleted-branch-${pr.number}`,
        targetBranch: pr.base?.ref || 'main',
        author: {
          username: pr.user?.login || 'unknown',
          avatarUrl: pr.user?.avatar_url || '',
        },
        createdAt: new Date(pr.created_at),
        updatedAt: new Date(pr.updated_at),
        mergedAt: pr.merged_at ? new Date(pr.merged_at) : undefined,
        url: pr.html_url,
      }));
    } catch (error: any) {
      throw new HttpException(
        `Failed to list pull requests: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async createPullRequest(
    repo: GitRepository,
    title: string,
    sourceBranch: string,
    targetBranch: string,
    credential: GitCredential,
    description?: string,
  ): Promise<PullRequest> {
    try {
      const [owner, name] = repo.remoteId.split('/');
      const data = {
        title,
        head: sourceBranch,
        base: targetBranch,
        body: description,
      };

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.getApiUrl(credential)}/repos/${owner}/${name}/pulls`,
          data,
          { headers: this.getHeaders(credential) },
        ),
      );

      const pr = response.data;
      return {
        id: pr.id.toString(),
        number: pr.number,
        title: pr.title,
        description: pr.body,
        state: pr.state === 'open' ? 'open' : pr.merged ? 'merged' : 'closed',
        sourceBranch: pr.head.ref,
        targetBranch: pr.base.ref,
        author: {
          username: pr.user.login,
          avatarUrl: pr.user.avatar_url,
        },
        createdAt: new Date(pr.created_at),
        updatedAt: new Date(pr.updated_at),
        mergedAt: pr.merged_at ? new Date(pr.merged_at) : undefined,
        url: pr.html_url,
      };
    } catch (error: any) {
      throw new HttpException(
        `Failed to create pull request: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async mergePullRequest(
    repo: GitRepository,
    prNumber: number,
    credential: GitCredential,
    method?: string,
  ): Promise<void> {
    try {
      const [owner, name] = repo.remoteId.split('/');
      const data: any = {};

      if (method) {
        data.merge_method = method;
      }

      await firstValueFrom(
        this.httpService.put(
          `${this.getApiUrl(
            credential,
          )}/repos/${owner}/${name}/pulls/${prNumber}/merge`,
          data,
          { headers: this.getHeaders(credential) },
        ),
      );
    } catch (error: any) {
      throw new HttpException(
        `Failed to merge pull request: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async listIssues(
    repo: GitRepository,
    credential: GitCredential,
    state?: string,
    labels?: string[],
  ): Promise<Issue[]> {
    try {
      const [owner, name] = repo.remoteId.split('/');
      const params: any = {
        per_page: 100,
        state: state || 'open',
      };

      if (labels && labels.length > 0) {
        params.labels = labels.join(',');
      }

      const response = await firstValueFrom(
        this.httpService.get(
          `${this.getApiUrl(credential)}/repos/${owner}/${name}/issues`,
          {
            headers: this.getHeaders(credential),
            params,
          },
        ),
      );

      return response.data
        .filter((issue: any) => !issue.pull_request)
        .map((issue: any) => ({
          id: issue.id.toString(),
          number: issue.number,
          title: issue.title,
          body: issue.body,
          state: issue.state,
          labels: issue.labels.map((label: any) => label.name),
          assignees: issue.assignees.map((assignee: any) => assignee.login),
          author: {
            username: issue.user.login,
            avatarUrl: issue.user.avatar_url,
          },
          createdAt: new Date(issue.created_at),
          updatedAt: new Date(issue.updated_at),
          closedAt: issue.closed_at ? new Date(issue.closed_at) : undefined,
          url: issue.html_url,
        }));
    } catch (error: any) {
      throw new HttpException(
        `Failed to list issues: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async createIssue(
    repo: GitRepository,
    title: string,
    credential: GitCredential,
    body?: string,
    labels?: string[],
    assignees?: string[],
  ): Promise<Issue> {
    try {
      const [owner, name] = repo.remoteId.split('/');
      const data: any = {
        title,
        body,
      };

      if (labels && labels.length > 0) {
        data.labels = labels;
      }

      if (assignees && assignees.length > 0) {
        data.assignees = assignees;
      }

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.getApiUrl(credential)}/repos/${owner}/${name}/issues`,
          data,
          { headers: this.getHeaders(credential) },
        ),
      );

      const issue = response.data;
      return {
        id: issue.id.toString(),
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        labels: issue.labels.map((label: any) => label.name),
        assignees: issue.assignees.map((assignee: any) => assignee.login),
        author: {
          username: issue.user.login,
          avatarUrl: issue.user.avatar_url,
        },
        createdAt: new Date(issue.created_at),
        updatedAt: new Date(issue.updated_at),
        closedAt: issue.closed_at ? new Date(issue.closed_at) : undefined,
        url: issue.html_url,
      };
    } catch (error: any) {
      throw new HttpException(
        `Failed to create issue: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async updateIssue(
    repo: GitRepository,
    issueNumber: number,
    updates: IssueUpdate,
    credential: GitCredential,
  ): Promise<Issue> {
    try {
      const [owner, name] = repo.remoteId.split('/');
      const data: any = {};

      if (updates.title) data.title = updates.title;
      if (updates.body) data.body = updates.body;
      if (updates.state) data.state = updates.state;
      if (updates.labels) data.labels = updates.labels;
      if (updates.assignees) data.assignees = updates.assignees;

      const response = await firstValueFrom(
        this.httpService.patch(
          `${this.getApiUrl(
            credential,
          )}/repos/${owner}/${name}/issues/${issueNumber}`,
          data,
          { headers: this.getHeaders(credential) },
        ),
      );

      const issue = response.data;
      return {
        id: issue.id.toString(),
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        labels: issue.labels.map((label: any) => label.name),
        assignees: issue.assignees.map((assignee: any) => assignee.login),
        author: {
          username: issue.user.login,
          avatarUrl: issue.user.avatar_url,
        },
        createdAt: new Date(issue.created_at),
        updatedAt: new Date(issue.updated_at),
        closedAt: issue.closed_at ? new Date(issue.closed_at) : undefined,
        url: issue.html_url,
      };
    } catch (error: any) {
      throw new HttpException(
        `Failed to update issue: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async createWebhook(
    repo: GitRepository,
    url: string,
    events: string[],
    credential: GitCredential,
    secret?: string,
  ): Promise<string> {
    try {
      const [owner, name] = repo.remoteId.split('/');
      const data: any = {
        config: {
          url,
          content_type: 'json',
        },
        events: events.length > 0 ? events : ['push'],
        active: true,
      };

      if (secret) {
        data.config.secret = secret;
      }

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.getApiUrl(credential)}/repos/${owner}/${name}/hooks`,
          data,
          { headers: this.getHeaders(credential) },
        ),
      );

      return response.data.id.toString();
    } catch (error: any) {
      throw new HttpException(
        `Failed to create webhook: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async deleteWebhook(
    repo: GitRepository,
    webhookId: string,
    credential: GitCredential,
  ): Promise<void> {
    try {
      const [owner, name] = repo.remoteId.split('/');
      await firstValueFrom(
        this.httpService.delete(
          `${this.getApiUrl(
            credential,
          )}/repos/${owner}/${name}/hooks/${webhookId}`,
          { headers: this.getHeaders(credential) },
        ),
      );
    } catch (error: any) {
      throw new HttpException(
        `Failed to delete webhook: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async searchRepositories(
    query: string,
    credential: GitCredential,
    limit?: number,
  ): Promise<GitRepository[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.getApiUrl(credential)}/search/repositories`,
          {
            headers: this.getHeaders(credential),
            params: {
              q: query,
              per_page: limit || 100,
            },
          },
        ),
      );

      return response.data.items.map((repo: any) =>
        this.mapToGitRepository(repo, credential),
      );
    } catch (error: any) {
      throw new HttpException(
        `Failed to search repositories: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async getUserInfo(credential: GitCredential): Promise<UserInfo> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.getApiUrl(credential)}/user`, {
          headers: this.getHeaders(credential),
        }),
      );

      return {
        username: response.data.login,
        email: response.data.email,
        avatarUrl: response.data.avatar_url,
      };
    } catch (error: any) {
      throw new HttpException(
        `Failed to get user info: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async getOrganizations(credential: GitCredential): Promise<Organization[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.getApiUrl(credential)}/user/orgs`, {
          headers: this.getHeaders(credential),
          params: {
            per_page: 100,
          },
        }),
      );

      return response.data.map((org: any) => ({
        id: org.id.toString(),
        name: org.login,
        avatarUrl: org.avatar_url,
      }));
    } catch (error: any) {
      throw new HttpException(
        `Failed to get organizations: ${
          error.response?.data?.message || error.message
        }`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private mapToGitRepository(
    githubRepo: any,
    credential: GitCredential,
  ): GitRepository {
    const repo = new GitRepository();
    repo.provider = GitProvider.GITHUB;
    repo.name = githubRepo.name;
    repo.description = githubRepo.description;
    repo.url = githubRepo.html_url;
    repo.cloneUrl = githubRepo.clone_url;
    repo.sshUrl = githubRepo.ssh_url;
    repo.defaultBranch = githubRepo.default_branch;
    repo.remoteId = githubRepo.full_name;
    repo.namespace = githubRepo.owner.login;
    repo.visibility = githubRepo.private
      ? RepositoryVisibility.PRIVATE
      : RepositoryVisibility.PUBLIC;
    repo.credentialId = credential.id;
    repo.isForked = githubRepo.fork;
    repo.parentUrl = githubRepo.parent?.html_url;
    repo.metadata = {
      stars: githubRepo.stargazers_count,
      forks: githubRepo.forks_count,
      watchers: githubRepo.watchers_count,
      openIssues: githubRepo.open_issues_count,
      language: githubRepo.language,
      topics: githubRepo.topics || [],
      lastCommitAt: githubRepo.pushed_at
        ? new Date(githubRepo.pushed_at)
        : undefined,
      size: githubRepo.size,
    };
    return repo;
  }

}