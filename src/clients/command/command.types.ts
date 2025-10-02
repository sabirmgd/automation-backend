export interface CommandOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  shell?: boolean | string;
  encoding?: BufferEncoding;
  maxBuffer?: number;
  killSignal?: NodeJS.Signals;
  uid?: number;
  gid?: number;
  windowsHide?: boolean;
}

export interface CommandResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  duration: number;
  command: string;
  killed: boolean;
  signal?: NodeJS.Signals;
  timedOut?: boolean;
  metadata?: Record<string, any>;
}

export interface StreamCallback {
  (chunk: string, type: 'stdout' | 'stderr'): void;
}

export interface ProgressCallback {
  (progress: ProgressInfo): void;
}

export interface ProgressInfo {
  percentage?: number;
  message?: string;
  phase?: string;
  metadata?: Record<string, any>;
}

export interface RetryOptions {
  attempts: number;
  delay: number;
  exponentialBackoff?: boolean;
  maxDelay?: number;
  shouldRetry?: (result: CommandResult, attempt: number) => boolean;
}

export interface CommandBuilderOptions extends CommandOptions {
  streamOutput?: StreamCallback;
  onProgress?: ProgressCallback;
  onStart?: () => void;
  onComplete?: (result: CommandResult) => void;
  onError?: (error: Error) => void;
  retry?: RetryOptions;
  condition?: () => boolean | Promise<boolean>;
  validateOutput?: (result: CommandResult) => boolean;
  parseOutput?: (stdout: string) => any;
  input?: string | Buffer;
}

export interface CommandTemplate {
  command: string;
  defaults?: Record<string, any>;
  options?: CommandOptions;
  description?: string;
  validate?: (params: Record<string, any>) => boolean;
}

export enum ExecutionMode {
  SEQUENTIAL = 'sequential',
  PARALLEL = 'parallel',
  PIPE = 'pipe',
}

export interface ParallelResult {
  results: CommandResult[];
  allSuccessful: boolean;
  duration: number;
  failedCommands: string[];
}

export interface ICommandExecutor {
  execute(command: string, options: CommandBuilderOptions): Promise<CommandResult>;
  executeMany(commands: string[], mode: ExecutionMode, options: CommandBuilderOptions): Promise<CommandResult[] | ParallelResult>;
  kill(pid?: number): void;
}

export class CommandExecutionError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly exitCode: number | null,
    public readonly stderr: string,
    public readonly stdout: string,
  ) {
    super(message);
    this.name = 'CommandExecutionError';
  }
}

export interface CommandHistoryEntry {
  id: string;
  command: string;
  options: CommandOptions;
  result: CommandResult;
  timestamp: Date;
  userId?: string;
  context?: string;
}