import { spawn, ChildProcess } from 'child_process';
import { ExecutionStrategy } from './execution.strategy';
import { CommandBuilderOptions, CommandResult, CommandExecutionError } from '../command.types';

export class SpawnStrategy extends ExecutionStrategy {
  private activeProcess: ChildProcess | null = null;
  private activeProcesses: Set<ChildProcess> = new Set();

  async execute(command: string, options: CommandBuilderOptions): Promise<CommandResult> {
    this.startTime = Date.now();
    const sanitizedCommand = this.sanitizeCommand(command);

    return new Promise((resolve, reject) => {
      const useShell = options.shell ?? false;
      const encoding: BufferEncoding = options.encoding || 'utf8';

      let cmd: string;
      let args: string[] = [];
      if (useShell) {
        // Let the shell parse the full command string
        cmd = sanitizedCommand;
      } else {
        const parsed = this.parseCommand(sanitizedCommand);
        cmd = parsed[0];
        args = parsed.slice(1);
      }

      const spawnOptions = {
        cwd: options.cwd || process.cwd(),
        env: this.mergeEnvironment(options.env),
        shell: useShell,
        windowsHide: options.windowsHide,
        uid: options.uid,
        gid: options.gid,
      };

      this.activeProcess = spawn(cmd, args, spawnOptions);
      const currentProcess = this.activeProcess;
      this.activeProcesses.add(currentProcess);

      let stdout = '';
      let stderr = '';
      let killed = false;
      let timedOut = false;
      let bufferExceeded = false;
      let timeoutHandle: NodeJS.Timeout | null = null;

      // Handle timeout
      if (options.timeout) {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          killed = true;
          currentProcess.kill(options.killSignal || 'SIGTERM');
        }, options.timeout);
      }

      // Call onStart callback
      if (options.onStart) {
        options.onStart();
      }

      // Handle stdout
      currentProcess.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString(encoding);
        stdout += chunk;

        if (options.maxBuffer && (stdout.length + stderr.length) > options.maxBuffer) {
          bufferExceeded = true;
          killed = true;
          currentProcess.kill(options.killSignal || 'SIGTERM');
          return;
        }

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
      currentProcess.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString(encoding);
        stderr += chunk;

        if (options.maxBuffer && (stdout.length + stderr.length) > options.maxBuffer) {
          bufferExceeded = true;
          killed = true;
          currentProcess.kill(options.killSignal || 'SIGTERM');
          return;
        }

        if (options.streamOutput) {
          options.streamOutput(chunk, 'stderr');
        }
      });

      // Provide stdin if input specified
      if (options.input !== undefined && currentProcess.stdin) {
        try {
          currentProcess.stdin.write(options.input);
        } catch {}
        try {
          currentProcess.stdin.end();
        } catch {}
      }

      // Handle process close
      currentProcess.on('close', (code, signal) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        if (bufferExceeded) {
          stderr = `${stderr}\n[maxBuffer exceeded]`;
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
          this.activeProcesses.delete(currentProcess);
          this.activeProcess = null;
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

        this.activeProcesses.delete(currentProcess);
        this.activeProcess = null;
      });

      // Handle process error
      currentProcess.on('error', (error) => {
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
        this.activeProcesses.delete(currentProcess);
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
      return;
    }

    // Kill all tracked processes
    for (const child of Array.from(this.activeProcesses)) {
      try {
        if (!child.killed) child.kill('SIGTERM');
      } catch (error) {
        console.error('Failed to kill process:', error);
      }
    }
  }

  private parseCommand(command: string): string[] {
    // Simple command parsing - can be enhanced with proper shell parsing
    const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    return parts.map(part => part.replace(/^"|"$/g, ''));
  }
}