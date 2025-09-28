import {
  CommandBuilderOptions,
  CommandResult,
  StreamCallback,
  ProgressCallback,
  RetryOptions,
  ICommandExecutor,
} from './command.types';

export class CommandBuilder {
  protected options: CommandBuilderOptions = {};

  constructor(
    protected readonly command: string,
    protected readonly executor: ICommandExecutor,
  ) {}

  inDirectory(path: string): this {
    this.options.cwd = path;
    return this;
  }

  withEnv(env: Record<string, string>): this {
    this.options.env = { ...this.options.env, ...env };
    return this;
  }

  withTimeout(milliseconds: number): this {
    this.options.timeout = milliseconds;
    return this;
  }

  withShell(shell: boolean | string = true): this {
    this.options.shell = shell;
    return this;
  }

  withEncoding(encoding: BufferEncoding): this {
    this.options.encoding = encoding;
    return this;
  }

  streamOutput(callback: StreamCallback): this {
    this.options.streamOutput = callback;
    return this;
  }

  onProgress(callback: ProgressCallback): this {
    this.options.onProgress = callback;
    return this;
  }

  onStart(callback: () => void): this {
    this.options.onStart = callback;
    return this;
  }

  onComplete(callback: (result: CommandResult) => void): this {
    this.options.onComplete = callback;
    return this;
  }

  onError(callback: (error: Error) => void): this {
    this.options.onError = callback;
    return this;
  }

  withRetry(options: RetryOptions): this {
    this.options.retry = options;
    return this;
  }

  onlyIf(condition: () => boolean | Promise<boolean>): this {
    this.options.condition = condition;
    return this;
  }

  validateOutput(validator: (result: CommandResult) => boolean): this {
    this.options.validateOutput = validator;
    return this;
  }

  parseOutput<T>(parser: (stdout: string) => T): this {
    this.options.parseOutput = parser;
    return this;
  }

  async run(): Promise<CommandResult> {
    // Check condition if provided
    if (this.options.condition) {
      const shouldRun = await this.options.condition();
      if (!shouldRun) {
        return {
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
          duration: 0,
          command: this.command,
          killed: false,
          metadata: { skipped: true, reason: 'Condition not met' },
        };
      }
    }

    // Execute with retry if configured
    if (this.options.retry) {
      return this.executeWithRetry();
    }

    // Regular execution
    return this.executor.execute(this.command, this.options);
  }

  async runAndParse<T>(): Promise<T> {
    const result = await this.run();

    if (this.options.parseOutput) {
      return this.options.parseOutput(result.stdout);
    }

    throw new Error('No parser defined. Use parseOutput() to define a parser.');
  }

  private async executeWithRetry(): Promise<CommandResult> {
    const { retry } = this.options;
    if (!retry) {
      return this.executor.execute(this.command, this.options);
    }

    let lastResult: CommandResult | null = null;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retry.attempts; attempt++) {
      try {
        lastResult = await this.executor.execute(this.command, this.options);

        // Check if we should retry based on the result
        if (retry.shouldRetry && !retry.shouldRetry(lastResult, attempt)) {
          return lastResult;
        }

        if (lastResult.success) {
          return lastResult;
        }
      } catch (error) {
        lastError = error as Error;
      }

      // Don't wait after the last attempt
      if (attempt < retry.attempts) {
        const delay = this.calculateDelay(attempt, retry);
        await this.sleep(delay);
      }
    }

    // All retries exhausted
    if (lastResult) {
      return lastResult;
    }

    throw lastError || new Error(`Command failed after ${retry.attempts} attempts: ${this.command}`);
  }

  private calculateDelay(attempt: number, retry: RetryOptions): number {
    if (!retry.exponentialBackoff) {
      return retry.delay;
    }

    const exponentialDelay = retry.delay * Math.pow(2, attempt - 1);
    return retry.maxDelay ? Math.min(exponentialDelay, retry.maxDelay) : exponentialDelay;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}