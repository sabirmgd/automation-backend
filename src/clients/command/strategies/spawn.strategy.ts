import { spawn, ChildProcess } from 'child_process';
import { ExecutionStrategy } from './execution.strategy';
import { CommandBuilderOptions, CommandResult, CommandExecutionError } from '../command.types';

export class SpawnStrategy extends ExecutionStrategy {
  private activeProcess: ChildProcess | null = null;

  async execute(command: string, options: CommandBuilderOptions): Promise<CommandResult> {
    this.startTime = Date.now();
    const sanitizedCommand = this.sanitizeCommand(command);

    return new Promise((resolve, reject) => {
      const [cmd, ...args] = this.parseCommand(sanitizedCommand);

      const spawnOptions = {
        cwd: options.cwd || process.cwd(),
        env: this.mergeEnvironment(options.env),
        shell: options.shell !== false,
        windowsHide: options.windowsHide,
        encoding: options.encoding || 'utf8' as BufferEncoding,
        uid: options.uid,
        gid: options.gid,
      };

      this.activeProcess = spawn(cmd, args, spawnOptions);

      let stdout = '';
      let stderr = '';
      let killed = false;
      let timedOut = false;
      let timeoutHandle: NodeJS.Timeout | null = null;

      // Handle timeout
      if (options.timeout) {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          killed = true;
          if (this.activeProcess) {
            this.activeProcess.kill(options.killSignal || 'SIGTERM');
          }
        }, options.timeout);
      }

      // Call onStart callback
      if (options.onStart) {
        options.onStart();
      }

      // Handle stdout
      this.activeProcess.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;

        if (options.streamOutput) {
          options.streamOutput(chunk, 'stdout');
        }

        // Check for progress patterns (e.g., "50% complete")
        if (options.onProgress) {
          const progressMatch = chunk.match(/(\d+)%/);
          if (progressMatch) {
            options.onProgress({
              percentage: parseInt(progressMatch[1]),
              message: chunk.trim(),
            });
          }
        }
      });

      // Handle stderr
      this.activeProcess.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;

        if (options.streamOutput) {
          options.streamOutput(chunk, 'stderr');
        }
      });

      // Handle process close
      this.activeProcess.on('close', (code, signal) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        const result = this.createResult(
          sanitizedCommand,
          code,
          stdout.trim(),
          stderr.trim(),
          killed,
          signal || undefined,
          timedOut,
        );

        // Call onComplete callback
        if (options.onComplete) {
          options.onComplete(result);
        }

        // Validate output if validator provided
        if (options.validateOutput && !options.validateOutput(result)) {
          const error = new CommandExecutionError(
            `Command output validation failed: ${sanitizedCommand}`,
            sanitizedCommand,
            code,
            stderr,
            stdout,
          );

          if (options.onError) {
            options.onError(error);
          }

          reject(error);
          return;
        }

        if (code !== 0 && !timedOut) {
          const error = new CommandExecutionError(
            `Command failed with exit code ${code}: ${sanitizedCommand}`,
            sanitizedCommand,
            code,
            stderr,
            stdout,
          );

          if (options.onError) {
            options.onError(error);
          }

          reject(error);
        } else if (timedOut) {
          const error = new CommandExecutionError(
            `Command timed out after ${options.timeout}ms: ${sanitizedCommand}`,
            sanitizedCommand,
            code,
            stderr,
            stdout,
          );

          if (options.onError) {
            options.onError(error);
          }

          reject(error);
        } else {
          resolve(result);
        }

        this.activeProcess = null;
      });

      // Handle process error
      this.activeProcess.on('error', (error) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        const executionError = new CommandExecutionError(
          `Failed to execute command: ${error.message}`,
          sanitizedCommand,
          null,
          '',
          stdout,
        );

        if (options.onError) {
          options.onError(executionError);
        }

        reject(executionError);
        this.activeProcess = null;
      });
    });
  }

  kill(pid?: number): void {
    if (pid) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch (error) {
        console.error(`Failed to kill process ${pid}:`, error);
      }
    } else if (this.activeProcess && !this.activeProcess.killed) {
      this.activeProcess.kill('SIGTERM');
    }
  }

  private parseCommand(command: string): string[] {
    // Simple command parsing - can be enhanced with proper shell parsing
    const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    return parts.map(part => part.replace(/^"|"$/g, ''));
  }
}