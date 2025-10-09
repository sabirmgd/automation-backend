import { Injectable, Logger } from '@nestjs/common';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { verificationPrompt } from './prompts/verification.prompt';

export interface VerificationInput {
  worktreePath: string;
  ticketKey: string;
  ticketDescription: string;
  preliminaryAnalysis: string;
  customInstructions?: string;
}

@Injectable()
export class VerificationAgentService {
  private readonly logger = new Logger(VerificationAgentService.name);

  constructor() {}

  async verifyWork(input: VerificationInput): Promise<string> {
    this.logger.log(`Starting verification for ticket ${input.ticketKey}`);

    try {
      const prompt = verificationPrompt(input);

      // Configure query options with worktree as working directory
      // Similar to preliminary analysis but with more tools for verification
      const queryOptions: any = {
        // Tools for verification (read, search, and test capabilities)
        allowedTools: ['Read', 'Grep', 'Glob', 'Bash', 'WebSearch'],

        // Set the working directory to the worktree path (pwd)
        cwd: input.worktreePath,

        // Use Claude Opus 4.1 model (same as preliminary analysis)
        model: 'claude-opus-4-1-20250805',

        maxTurns: 100,

        // Use Claude Code preset with additional context
        systemPrompt: {
          type: 'preset' as const,
          preset: 'claude_code' as const,
          append: `You are performing a verification of completed work. Your current working directory (pwd) is: ${input.worktreePath}`
        },

        permissionMode: 'bypassPermissions' as const
      };

      const queryGenerator = query({
        prompt: prompt,
        options: queryOptions
      });

      this.logger.log('Running verification with Claude Agent SDK...');

      // Collect all messages from the generator (similar to preliminary analysis)
      let report = '';
      let messageCount = 0;

      for await (const message of queryGenerator) {
        messageCount++;
        this.logger.debug(`Processing message ${messageCount} - Type: ${message.type}`);

        // Extract text from assistant messages (same pattern as preliminary analysis)
        if (message.type === 'assistant' && 'message' in message) {
          const content = message.message.content;

          if (Array.isArray(content)) {
            for (const item of content) {
              if (item.type === 'text') {
                report += item.text + '\n';
                this.logger.debug(`Added ${item.text.length} chars from message ${messageCount}`);
              }
            }
          } else if (typeof content === 'string') {
            report += content + '\n';
          }
        }
      }

      this.logger.log(`Verification completed for ticket ${input.ticketKey} after ${messageCount} messages`);
      return report.trim();

    } catch (error) {
      this.logger.error(`Verification failed: ${error.message}`, error.stack);
      throw new Error(`Verification failed: ${error.message}`);
    }
  }
}