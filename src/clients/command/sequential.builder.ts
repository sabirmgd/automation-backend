import {
  CommandResult,
  ICommandExecutor,
  CommandExecutionError,
  CommandBuilderOptions,
  StreamCallback,
  ProgressCallback,
  RetryOptions
} from './command.types';

export class SequentialCommandBuilder {
  protected options: CommandBuilderOptions = {};
  private stopOnError = true;
  private passOutput = false;

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

  withShell(shell: boolean | string = true): this {
    this.options.shell = shell;
    return this;
  }

  withEncoding(encoding: BufferEncoding): this {
    this.options.encoding = encoding;
    return this;
  }

  onlyIf(condition: () => boolean | Promise<boolean>): this {
    this.options.condition = condition;
    return this;
  }

  continueOnError(): this {
    this.stopOnError = false;
    return this;
  }

  pipeOutput(): this {
    this.passOutput = true;
    return this;
  }

  async run(): Promise<CommandResult[]> {
    const results: CommandResult[] = [];
    let previousOutput = '';

    // Check condition if provided
    if (this.options.condition) {
      const shouldRun = await this.options.condition();
      if (!shouldRun) {
        return [];
      }
    }

    // Let strategy handle onStart per process

    for (let i = 0; i < this.commands.length; i++) {
      const command = this.commands[i];
      let actualCommand = command;

      // If piping output, pass previous output via stdin instead of shell echo
      if (this.passOutput && previousOutput && i > 0) {
        this.options.input = previousOutput;
      }

      try {
        const result = await this.executor.execute(actualCommand, this.options);
        results.push(result);

        if (this.passOutput) {
          previousOutput = result.stdout;
        }

        // Report progress
        if (this.options.onProgress) {
          this.options.onProgress({
            percentage: Math.round(((i + 1) / this.commands.length) * 100),
            message: `Completed ${i + 1} of ${this.commands.length} commands`,
            phase: `Executing: ${command}`,
          });
        }

        if (!result.success && this.stopOnError) {
          if (this.options.onError) {
            this.options.onError(
              new CommandExecutionError(
                `Sequential execution stopped at command ${i + 1}: ${command}`,
                command,
                result.exitCode,
                result.stderr,
                result.stdout,
              ),
            );
          }
          break;
        }
      } catch (error) {
        const executionError = error as CommandExecutionError;
        const errorResult: CommandResult = {
          success: false,
          exitCode: executionError.exitCode || 1,
          stdout: executionError.stdout || '',
          stderr: executionError.stderr || executionError.message,
          duration: 0,
          command: actualCommand,
          killed: false,
        };

        results.push(errorResult);

        if (this.stopOnError) {
          if (this.options.onError) {
            this.options.onError(executionError);
          }
          break;
        }
      }
    }

    // Let strategy handle onComplete per process

    return results;
  }

  async runAsTransaction(): Promise<CommandResult[]> {
    const results: CommandResult[] = [];
    const rollbackCommands: string[] = [];

    // Store original stopOnError setting
    const originalStopOnError = this.stopOnError;
    this.stopOnError = true;

    try {
      const executionResults = await this.run();

      // Check if all succeeded
      const allSuccessful = executionResults.every(r => r.success);

      if (!allSuccessful && rollbackCommands.length > 0) {
        // Execute rollback commands in reverse order
        console.log('Rolling back transaction...');
        for (const rollbackCmd of rollbackCommands.reverse()) {
          try {
            await this.executor.execute(rollbackCmd, { ...this.options, timeout: 30000 });
          } catch (error) {
            console.error('Rollback command failed:', error);
          }
        }

        throw new Error('Transaction failed and was rolled back');
      }

      return executionResults;
    } finally {
      this.stopOnError = originalStopOnError;
    }
  }

  withRollback(rollbackMap: Map<number, string>): this {
    // This would store rollback commands for each step
    // Implementation would be more complex in production
    return this;
  }
}