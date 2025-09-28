import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { CommandClient } from './command.client';
import { CommandResult, ParallelResult } from './command.types';

@Controller('commands')
export class CommandController {
  constructor(private readonly commandClient: CommandClient) {}

  @Get('test')
  async testCommand(): Promise<CommandResult> {
    return this.commandClient
      .command('echo "Hello from Command Client"')
      .withTimeout(5000)
      .run();
  }

  @Post('execute')
  async executeCommand(
    @Body('command') command: string,
    @Body('cwd') cwd?: string,
    @Body('timeout') timeout?: number,
  ): Promise<CommandResult> {
    const builder = this.commandClient.command(command);

    if (cwd) builder.inDirectory(cwd);
    if (timeout) builder.withTimeout(timeout);

    return builder.run();
  }

  @Post('parallel')
  async executeParallel(
    @Body('commands') commands: string[],
    @Body('timeout') timeout?: number,
  ): Promise<ParallelResult> {
    const builder = this.commandClient.parallel(commands);

    if (timeout) builder.withTimeout(timeout);

    return builder.run();
  }

  @Post('sequential')
  async executeSequential(
    @Body('commands') commands: string[],
    @Body('continueOnError') continueOnError?: boolean,
  ): Promise<CommandResult[]> {
    const builder = this.commandClient.sequence(commands);

    if (continueOnError) builder.continueOnError();

    return builder.run();
  }

  @Get('exists')
  async checkCommand(@Query('command') command: string): Promise<{ exists: boolean }> {
    const exists = await this.commandClient.commandExists(command);
    return { exists };
  }

  @Get('history')
  async getHistory(@Query('limit') limit?: string) {
    return this.commandClient.getHistory(limit ? parseInt(limit) : undefined);
  }

  @Post('template')
  async executeTemplate(
    @Body('template') template: string,
    @Body('params') params: Record<string, any>,
  ): Promise<CommandResult> {
    return this.commandClient.fromTemplate(template, params).run();
  }

  @Get('demo')
  async demonstrateUsage() {
    // Various usage examples
    const examples = {
      // Simple command
      simple: await this.commandClient
        .command('echo "Simple command"')
        .run(),

      // With directory
      withDirectory: await this.commandClient
        .command('ls -la')
        .inDirectory('/tmp')
        .withTimeout(5000)
        .run(),

      // Parallel execution
      parallel: await this.commandClient
        .parallel([
          'echo "Command 1"',
          'echo "Command 2"',
          'echo "Command 3"',
        ])
        .withTimeout(10000)
        .run(),

      // Sequential execution
      sequential: await this.commandClient
        .sequence([
          'echo "Step 1"',
          'echo "Step 2"',
          'echo "Step 3"',
        ])
        .run(),

      // With retry
      withRetry: await this.commandClient
        .command('echo "Retry example"')
        .withRetry({
          attempts: 3,
          delay: 1000,
          exponentialBackoff: true,
        })
        .run(),

      // Conditional execution
      conditional: await this.commandClient
        .command('echo "Conditional"')
        .onlyIf(() => true)
        .run(),

      // Parse output
      parsed: await this.commandClient
        .command('echo "42"')
        .parseOutput((output) => parseInt(output))
        .runAndParse(),
    };

    return examples;
  }
}