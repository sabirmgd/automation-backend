import { Injectable } from '@nestjs/common';
import { CommandBuilder } from './command.builder';
import { ParallelCommandBuilder } from './parallel.builder';
import { SequentialCommandBuilder } from './sequential.builder';
import { SpawnStrategy } from './strategies/spawn.strategy';
import {
  CommandResult,
  CommandTemplate,
  ICommandExecutor,
  CommandBuilderOptions,
  ExecutionMode,
  ParallelResult,
  CommandHistoryEntry,
} from './command.types';
import { randomUUID } from 'crypto';

@Injectable()
export class CommandClient implements ICommandExecutor {
  private strategy: SpawnStrategy;
  private templates: Map<string, CommandTemplate> = new Map();
  private history: CommandHistoryEntry[] = [];
  private maxHistorySize = 100;

  constructor() {
    this.strategy = new SpawnStrategy();
    this.initializeDefaultTemplates();
  }

  /**
   * Create a command builder for fluent API
   */
  command(command: string): CommandBuilder {
    return new CommandBuilder(command, this);
  }

  /**
   * Execute multiple commands in parallel
   */
  parallel(commands: string[]): ParallelCommandBuilder {
    return new ParallelCommandBuilder(commands, this);
  }

  /**
   * Execute commands sequentially
   */
  sequence(commands: string[]): SequentialCommandBuilder {
    return new SequentialCommandBuilder(commands, this);
  }

  /**
   * Execute commands with output piping
   */
  pipe(commands: string[]): SequentialCommandBuilder {
    return new SequentialCommandBuilder(commands, this).pipeOutput();
  }

  /**
   * Direct execution (used by builders)
   */
  async executeDirectly(command: string, options: CommandBuilderOptions): Promise<CommandResult> {
    const startTime = Date.now();

    try {
      const result = await this.strategy.execute(command, options);

      // Store in history
      this.addToHistory(command, options, result);

      return result;
    } catch (error) {
      const err = error as any;
      const failedResult: CommandResult = {
        success: false,
        exitCode: typeof err.exitCode === 'number' ? err.exitCode : null,
        stdout: typeof err.stdout === 'string' ? err.stdout : '',
        stderr: typeof err.stderr === 'string' ? err.stderr : (err.message || 'Command failed'),
        duration: Date.now() - startTime,
        command,
        killed: !!err.killed,
        signal: err.signal,
        timedOut: !!err.timedOut,
        metadata: { errorName: err.name },
      };

      this.addToHistory(command, options, failedResult);

      throw error;
    }
  }

  /**
   * Execute many commands (used internally by builders)
   */
  async executeMany(
    commands: string[],
    mode: ExecutionMode,
    options: CommandBuilderOptions,
  ): Promise<CommandResult[] | ParallelResult> {
    switch (mode) {
      case ExecutionMode.PARALLEL: {
        const builder = this.parallel(commands);
        if (options.cwd) builder.inDirectory(options.cwd);
        if (options.timeout) builder.withTimeout(options.timeout);
        if (options.env) builder.withEnv(options.env);
        if (options.shell !== undefined) builder.withShell(options.shell);
        if (options.encoding) builder.withEncoding(options.encoding);
        if (options.streamOutput) builder.streamOutput(options.streamOutput);
        if (options.onProgress) builder.onProgress(options.onProgress);
        if (options.onStart) builder.onStart(options.onStart);
        if (options.onComplete) builder.onComplete(options.onComplete);
        if (options.onError) builder.onError(options.onError);
        if (options.retry) builder.withRetry(options.retry);
        if (options.condition) builder.onlyIf(options.condition);
        return builder.run();
      }
      case ExecutionMode.SEQUENTIAL: {
        const builder = this.sequence(commands);
        if (options.cwd) builder.inDirectory(options.cwd);
        if (options.timeout) builder.withTimeout(options.timeout);
        if (options.env) builder.withEnv(options.env);
        if (options.shell !== undefined) builder.withShell(options.shell);
        if (options.encoding) builder.withEncoding(options.encoding);
        if (options.streamOutput) builder.streamOutput(options.streamOutput);
        if (options.onProgress) builder.onProgress(options.onProgress);
        if (options.onStart) builder.onStart(options.onStart);
        if (options.onComplete) builder.onComplete(options.onComplete);
        if (options.onError) builder.onError(options.onError);
        if (options.retry) builder.withRetry(options.retry);
        if (options.condition) builder.onlyIf(options.condition);
        return builder.run();
      }
      case ExecutionMode.PIPE: {
        const builder = this.sequence(commands).pipeOutput();
        if (options.cwd) builder.inDirectory(options.cwd);
        if (options.timeout) builder.withTimeout(options.timeout);
        if (options.env) builder.withEnv(options.env);
        if (options.shell !== undefined) builder.withShell(options.shell);
        if (options.encoding) builder.withEncoding(options.encoding);
        if (options.streamOutput) builder.streamOutput(options.streamOutput);
        if (options.onProgress) builder.onProgress(options.onProgress);
        if (options.onStart) builder.onStart(options.onStart);
        if (options.onComplete) builder.onComplete(options.onComplete);
        if (options.onError) builder.onError(options.onError);
        if (options.retry) builder.withRetry(options.retry);
        if (options.condition) builder.onlyIf(options.condition);
        return builder.run();
      }
      default:
        throw new Error(`Unknown execution mode: ${mode}`);
    }
  }

  /**
   * Kill a running process
   */
  kill(pid?: number): void {
    this.strategy.kill(pid);
  }

  /**
   * Register a command template
   */
  registerTemplate(name: string, template: CommandTemplate): void {
    this.templates.set(name, template);
  }

  /**
   * Create a command from a template
   */
  fromTemplate(name: string, params: Record<string, any> = {}): CommandBuilder {
    const template = this.templates.get(name);
    if (!template) {
      throw new Error(`Template '${name}' not found`);
    }

    // Validate parameters if validator provided
    if (template.validate && !template.validate(params)) {
      throw new Error(`Invalid parameters for template '${name}'`);
    }

    // Merge params with defaults
    const finalParams = { ...template.defaults, ...params };

    // Replace placeholders in command
    let command = template.command;
    for (const [key, value] of Object.entries(finalParams)) {
      command = command.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }

    // Create builder with template options
    const builder = new CommandBuilder(command, this);

    if (template.options) {
      if (template.options.cwd) builder.inDirectory(template.options.cwd);
      if (template.options.timeout) builder.withTimeout(template.options.timeout);
      if (template.options.env) builder.withEnv(template.options.env);
    }

    return builder;
  }

  /**
   * Get command history
   */
  getHistory(limit?: number): CommandHistoryEntry[] {
    return limit ? this.history.slice(-limit) : [...this.history];
  }

  /**
   * Clear command history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Quick execution methods for common operations
   */
  async exec(command: string, options?: Partial<CommandBuilderOptions>): Promise<CommandResult> {
    const builder = this.command(command);

    if (options?.cwd) builder.inDirectory(options.cwd);
    if (options?.timeout) builder.withTimeout(options.timeout);
    if (options?.env) builder.withEnv(options.env);
    if (options?.shell !== undefined) builder.withShell(options.shell);
    if (options?.encoding) builder.withEncoding(options.encoding);
    if (options?.streamOutput) builder.streamOutput(options.streamOutput);
    if (options?.onProgress) builder.onProgress(options.onProgress);
    if (options?.onStart) builder.onStart(options.onStart);
    if (options?.onComplete) builder.onComplete(options.onComplete);
    if (options?.onError) builder.onError(options.onError);
    if (options?.retry) builder.withRetry(options.retry);
    if (options?.condition) builder.onlyIf(options.condition);

    return builder.run();
  }

  /**
   * Execute and get output only
   */
  async getOutput(command: string, options?: Partial<CommandBuilderOptions>): Promise<string> {
    const result = await this.exec(command, options);
    return result.stdout;
  }

  /**
   * Check if a command exists
   */
  async commandExists(command: string): Promise<boolean> {
    try {
      const isWindows = process.platform === 'win32';
      const checkCmd = isWindows ? `where ${command}` : `command -v ${command}`;
      const result = await this.exec(checkCmd, { timeout: 5000, shell: true });
      return result.success && result.stdout.trim() !== '' && !/not found|could not be found/i.test(result.stderr);
    } catch {
      return false;
    }
  }

  /**
   * Private helper methods
   */
  private addToHistory(
    command: string,
    options: CommandBuilderOptions,
    result: CommandResult,
  ): void {
    const entry: CommandHistoryEntry = {
      id: randomUUID(),
      command,
      options: {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeout,
        shell: options.shell,
        encoding: options.encoding,
      },
      result,
      timestamp: new Date(),
    };

    this.history.push(entry);

    // Trim history if it exceeds max size
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }
  }

  private initializeDefaultTemplates(): void {
    // NPM templates
    this.registerTemplate('npm:install', {
      command: 'npm install {{package}}',
      defaults: { package: '' },
      options: { timeout: 60000 },
    });

    this.registerTemplate('npm:run', {
      command: 'npm run {{script}}',
      defaults: { script: 'build' },
      options: { timeout: 120000 },
    });

    // Git templates
    this.registerTemplate('git:status', {
      command: 'git status --short',
      options: { timeout: 5000 },
    });

    this.registerTemplate('git:commit', {
      command: 'git commit -m "{{message}}"',
      validate: (params) => !!params.message && params.message.length > 0,
    });

    // Docker templates
    this.registerTemplate('docker:build', {
      command: 'docker build -t {{tag}} {{path}}',
      defaults: { path: '.' },
      validate: (params) => !!params.tag,
    });

    // System templates
    this.registerTemplate('system:disk-usage', {
      command: 'df -h {{path}}',
      defaults: { path: '/' },
      options: { timeout: 5000 },
    });
  }

  /**
   * Implementation of ICommandExecutor interface
   * This is used internally by builders
   */
  async execute(command: string, options: CommandBuilderOptions): Promise<CommandResult> {
    return this.executeDirectly(command, options);
  }
}