import { GitRepository } from '../entities/git-repository.entity';
import { GitCredential } from '../entities/git-credential.entity';
import { GitProvider as GitProviderType } from '../entities/git-repository.entity';

export interface CreateRepositoryOptions {
  name: string;
  description?: string;
  namespace?: string;
  private?: boolean;
  autoInit?: boolean;
  gitignoreTemplate?: string;
  licenseTemplate?: string;
}

export interface CloneOptions {
  localPath: string;
  branch?: string;
  depth?: number;
  recursive?: boolean;
}

export interface Branch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected?: boolean;
  isDefault?: boolean;
}

export interface Tag {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  message?: string;
}

export interface Commit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: Date;
  };
  url?: string;
}

export interface FileContent {
  path: string;
  content: string;
  encoding: string;
  size: number;
  sha: string;
}

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  description?: string;
  state: 'open' | 'closed' | 'merged';
  sourceBranch: string;
  targetBranch: string;
  author: {
    username: string;
    avatarUrl?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  mergedAt?: Date;
  url: string;
}

export interface Issue {
  id: string;
  number: number;
  title: string;
  body?: string;
  state: string;
  labels: string[];
  assignees: string[];
  author: {
    username: string;
    avatarUrl?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  url: string;
}

export interface IssueUpdate {
  title?: string;
  body?: string;
  state?: string;
  labels?: string[];
  assignees?: string[];
}

export interface UserInfo {
  username: string;
  email?: string;
  avatarUrl?: string;
}

export interface Organization {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface IGitProvider {
  name: string;
  type: GitProviderType;

  // Authentication
  authenticate(credential: GitCredential): Promise<boolean>;
  validateCredential(credential: GitCredential): Promise<boolean>;

  // Repository management
  createRepository(
    options: CreateRepositoryOptions,
    credential: GitCredential,
  ): Promise<GitRepository>;
  getRepository(
    owner: string,
    repo: string,
    credential: GitCredential,
  ): Promise<GitRepository>;
  listRepositories(
    credential: GitCredential,
    namespace?: string,
  ): Promise<GitRepository[]>;
  deleteRepository(repoId: string, credential: GitCredential): Promise<void>;

  // Git operations
  cloneRepository(repo: GitRepository, options: CloneOptions): Promise<void>;
  pullChanges(repo: GitRepository, branch?: string): Promise<void>;
  pushChanges(
    repo: GitRepository,
    branch?: string,
    message?: string,
  ): Promise<void>;

  // Branch management
  getBranches(repo: GitRepository, credential: GitCredential): Promise<Branch[]>;
  createBranch(
    repo: GitRepository,
    branchName: string,
    fromBranch: string,
    credential: GitCredential,
  ): Promise<Branch>;
  deleteBranch(
    repo: GitRepository,
    branchName: string,
    credential: GitCredential,
  ): Promise<void>;

  // Tag management
  getTags(repo: GitRepository, credential: GitCredential): Promise<Tag[]>;
  createTag(
    repo: GitRepository,
    tagName: string,
    sha: string,
    credential: GitCredential,
    message?: string,
  ): Promise<Tag>;
  deleteTag(
    repo: GitRepository,
    tagName: string,
    credential: GitCredential,
  ): Promise<void>;

  // Commit management
  getCommits(
    repo: GitRepository,
    credential: GitCredential,
    branch?: string,
    limit?: number,
  ): Promise<Commit[]>;
  getCommit(
    repo: GitRepository,
    sha: string,
    credential: GitCredential,
  ): Promise<Commit>;

  // File operations
  getFile(
    repo: GitRepository,
    filePath: string,
    credential: GitCredential,
    branch?: string,
  ): Promise<FileContent>;
  createFile(
    repo: GitRepository,
    filePath: string,
    content: string,
    message: string,
    credential: GitCredential,
    branch?: string,
  ): Promise<void>;
  updateFile(
    repo: GitRepository,
    filePath: string,
    content: string,
    message: string,
    sha: string,
    credential: GitCredential,
    branch?: string,
  ): Promise<void>;
  deleteFile(
    repo: GitRepository,
    filePath: string,
    message: string,
    sha: string,
    credential: GitCredential,
    branch?: string,
  ): Promise<void>;

  // Pull requests
  listPullRequests(
    repo: GitRepository,
    credential: GitCredential,
    state?: string,
  ): Promise<PullRequest[]>;
  createPullRequest(
    repo: GitRepository,
    title: string,
    sourceBranch: string,
    targetBranch: string,
    credential: GitCredential,
    description?: string,
  ): Promise<PullRequest>;
  mergePullRequest(
    repo: GitRepository,
    prNumber: number,
    credential: GitCredential,
    method?: string,
  ): Promise<void>;

  // Issues
  listIssues(
    repo: GitRepository,
    credential: GitCredential,
    state?: string,
    labels?: string[],
  ): Promise<Issue[]>;
  createIssue(
    repo: GitRepository,
    title: string,
    credential: GitCredential,
    body?: string,
    labels?: string[],
    assignees?: string[],
  ): Promise<Issue>;
  updateIssue(
    repo: GitRepository,
    issueNumber: number,
    updates: IssueUpdate,
    credential: GitCredential,
  ): Promise<Issue>;

  // Webhooks
  createWebhook(
    repo: GitRepository,
    url: string,
    events: string[],
    credential: GitCredential,
    secret?: string,
  ): Promise<string>;
  deleteWebhook(
    repo: GitRepository,
    webhookId: string,
    credential: GitCredential,
  ): Promise<void>;

  // Search
  searchRepositories(
    query: string,
    credential: GitCredential,
    limit?: number,
  ): Promise<GitRepository[]>;

  // User info
  getUserInfo(credential: GitCredential): Promise<UserInfo>;
  getOrganizations(credential: GitCredential): Promise<Organization[]>;
}