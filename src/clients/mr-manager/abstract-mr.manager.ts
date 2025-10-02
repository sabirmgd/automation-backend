export interface PullRequestResult {
  id: string | number;
  number: number;
  url: string;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  status: string;
  hasConflicts?: boolean;
}

export interface ConflictCheckResult {
  hasConflicts: boolean;
  conflictingFiles?: string[];
  canAutoMerge: boolean;
}

export interface DiffPosition {
  baseSha: string;
  startSha?: string;
  headSha: string;
  oldPath?: string;
  newPath: string;
  oldLine?: number;  // For GitLab: line in old file
  newLine: number;    // For both: line in new file (end line for multi-line)
  startLine?: number; // For GitHub multi-line: start line in new file
}

export interface CommentResult {
  id: string;
  url?: string;
  body: string;
  createdAt: Date;
}

export interface PullRequestDiff {
  oldPath?: string;
  newPath: string;
  diff: string;
  newFile: boolean;
  deletedFile: boolean;
  renamedFile: boolean;
}

export abstract class AbstractMrManager {
  abstract createPullRequest(
    repo: string,
    fromBranch: string,
    toBranch: string,
    title: string,
    description?: string,
    token?: string,
  ): Promise<PullRequestResult>;

  abstract checkForConflicts(
    repo: string,
    fromBranch: string,
    toBranch: string,
    token?: string,
  ): Promise<ConflictCheckResult>;

  abstract getPullRequestStatus(
    repo: string,
    prNumber: number,
    token?: string,
  ): Promise<PullRequestResult>;

  abstract listPullRequests(
    repo: string,
    state?: 'open' | 'closed' | 'all',
    token?: string,
  ): Promise<PullRequestResult[]>;

  abstract getPullRequestDiff(
    repo: string,
    prNumber: number,
    token?: string,
  ): Promise<string>;

  abstract getPullRequestChanges(
    repo: string,
    prNumber: number,
    token?: string,
  ): Promise<PullRequestDiff[]>;

  abstract createInlineComment(
    repo: string,
    prNumber: number,
    body: string,
    path: string,
    position: DiffPosition,
    token?: string,
  ): Promise<CommentResult>;

  abstract createBulkComments(
    repo: string,
    prNumber: number,
    comments: Array<{
      body: string;
      path: string;
      position: DiffPosition;
    }>,
    token?: string,
  ): Promise<CommentResult[]>;

  abstract getCommentPosition(
    repo: string,
    prNumber: number,
    path: string,
    lineNumber: number,
    token?: string,
  ): Promise<DiffPosition | null>;
}