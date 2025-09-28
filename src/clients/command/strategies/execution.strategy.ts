import { CommandBuilderOptions, CommandResult } from '../command.types';

export abstract class ExecutionStrategy {
  protected startTime: number;

  abstract execute(command: string, options: CommandBuilderOptions): Promise<CommandResult>;

  abstract kill(pid?: number): void;

  protected createResult(
    command: string,
    exitCode: number | null,
    stdout: string,
    stderr: string,
    killed: boolean = false,
    signal?: NodeJS.Signals,
    timedOut?: boolean,
  ): CommandResult {
    const duration = Date.now() - this.startTime;
    return {
      success: exitCode === 0,
      exitCode,
      stdout,
      stderr,
      duration,
      command,
      killed,
      signal,
      timedOut,
    };
  }

  protected sanitizeCommand(command: string): string {
    // Basic sanitization - can be extended
    return command.trim();
  }

  protected mergeEnvironment(customEnv?: Record<string, string>): NodeJS.ProcessEnv {
    return {
      ...process.env,
      ...customEnv,
    };
  }
}