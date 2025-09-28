import {
  CommandResult,
  ParallelResult,
  ICommandExecutor,
  CommandBuilderOptions,
  StreamCallback,
  ProgressCallback,
  RetryOptions
} from './command.types';

export class ParallelCommandBuilder {
  protected options: CommandBuilderOptions = {};

  constructor(
    private readonly commands: string[],
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

  async run(): Promise<ParallelResult> {
    const startTime = Date.now();

    // Check condition if provided
    if (this.options.condition) {
      const shouldRun = await this.options.condition();
      if (!shouldRun) {
        return {
          results: [],
          allSuccessful: true,
          duration: 0,
          failedCommands: [],
        };
      }
    }

    if (this.options.onStart) {
      this.options.onStart();
    }

    // Execute all commands in parallel
    const promises = this.commands.map(command =>
      this.executor
        .execute(command, this.options)
        .catch(error => ({
          success: false,
          exitCode: error.exitCode || 1,
          stdout: error.stdout || '',
          stderr: error.stderr || error.message,
          duration: 0,
          command,
          killed: false,
        } as CommandResult)),
    );

    const results = await Promise.all(promises);
    const duration = Date.now() - startTime;

    const failedCommands = results
      .filter(result => !result.success)
      .map(result => result.command);

    const parallelResult: ParallelResult = {
      results,
      allSuccessful: failedCommands.length === 0,
      duration,
      failedCommands,
    };

    if (this.options.onComplete) {
      // Call onComplete for each result
      results.forEach(result => this.options.onComplete?.(result));
    }

    return parallelResult;
  }

  async runUntilSuccess(): Promise<CommandResult> {
    const result = await this.run();

    // Return the first successful result
    const successfulResult = result.results.find(r => r.success);

    if (successfulResult) {
      return successfulResult;
    }

    // If none successful, return the first result with error info
    throw new Error(`All ${this.commands.length} commands failed`);
  }

  async runWithFailFast(): Promise<ParallelResult> {
    const startTime = Date.now();
    const results: CommandResult[] = [];
    const failedCommands: string[] = [];

    // Check condition if provided
    if (this.options.condition) {
      const shouldRun = await this.options.condition();
      if (!shouldRun) {
        return {
          results: [],
          allSuccessful: true,
          duration: 0,
          failedCommands: [],
        };
      }
    }

    if (this.options.onStart) {
      this.options.onStart();
    }

    // Create abort controller for cancellation
    const runningProcesses = new Map<string, Promise<CommandResult>>();

    try {
      for (const command of this.commands) {
        const promise = this.executor.execute(command, this.options);
        runningProcesses.set(command, promise);

        promise.then(
          result => {
            results.push(result);
            runningProcesses.delete(command);
            if (!result.success) {
              failedCommands.push(command);
              // Cancel other running processes on first failure
              this.cancelRunningProcesses(runningProcesses);
            }
          },
          error => {
            results.push({
              success: false,
              exitCode: error.exitCode || 1,
              stdout: error.stdout || '',
              stderr: error.stderr || error.message,
              duration: 0,
              command,
              killed: false,
            });
            failedCommands.push(command);
            runningProcesses.delete(command);
            // Cancel other running processes on first failure
            this.cancelRunningProcesses(runningProcesses);
          },
        );
      }

      // Wait for all to complete or fail
      await Promise.allSettled(Array.from(runningProcesses.values()));
    } catch (error) {
      // Handle unexpected errors
      console.error('Parallel execution error:', error);
    }

    const duration = Date.now() - startTime;

    return {
      results,
      allSuccessful: failedCommands.length === 0,
      duration,
      failedCommands,
    };
  }

  private cancelRunningProcesses(processes: Map<string, Promise<CommandResult>>): void {
    // In a real implementation, we would need a way to cancel running processes
    // This would require tracking process IDs or using AbortController
    processes.clear();
  }
}