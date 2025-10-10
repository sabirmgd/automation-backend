import { Injectable, Logger } from '@nestjs/common';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { integrationTestPrompt } from './prompts/integration-test.prompt';

export interface TestingInput {
  accessToken?: string;
  worktreePath: string;
  ticketKey: string;
  ticketDescription: string;
  implementationSummary: string;
  testingInstructions: string;
  projectMetadata?: {
    backendPath?: string;
    frontendPath?: string;
    startCommand?: string;
    testPort?: number;
    healthEndpoint?: string;
    apiBaseUrl?: string;
    authToken?: string;
    dbConnectionString?: string;
    apiEndpoints?: string[];
    cleanupCommands?: string[];
  };
  customInstructions?: string;
}

export interface TestEndpointResult {
  endpoint: string;
  method: string;
  path: string;
  authRequired: boolean;
  testCases: {
    description: string;
    passed: boolean;
    error?: string;
    responseTime?: number;
    statusCode?: number;
  }[];
  averageResponseTime: number;
}

export interface DatabaseCheck {
  tableName: string;
  recordsCreated: number;
  recordsUpdated: number;
  integrityPassed: boolean;
  notes?: string;
}

export interface TestSummary {
  totalEndpoints: number;
  passedEndpoints: number;
  failedEndpoints: number;
  averageResponseTime: number;
  databaseOperations: number;
  allPassed: boolean;
  overallStatus: 'success' | 'partial' | 'failed';
}

export interface TestingResult {
  serverStatus: 'started' | 'failed' | 'already_running';
  serverPort: number;
  serverPid?: number;
  startupTime?: number;
  testResults: TestEndpointResult[];
  databaseChecks: DatabaseCheck[];
  cleanupStatus: 'success' | 'partial' | 'failed';
  cleanupIssues?: string[];
  summary: TestSummary;
  fullReport: string;
}

@Injectable()
export class TestingAgentService {
  private readonly logger = new Logger(TestingAgentService.name);

  constructor() {}

  async runIntegrationTests(input: TestingInput): Promise<string> {
    this.logger.log(`Starting integration tests for ticket ${input.ticketKey}`);

    try {
      const prompt = integrationTestPrompt(input);

      // Configure query options for testing
      const queryOptions: any = {
        // Tools for testing - no Write/Edit needed, just testing
        allowedTools: ['Read', 'Grep', 'Glob', 'Bash', 'WebFetch'],

        // Set the working directory to the worktree path
        cwd: input.worktreePath,

        // Use Claude Opus 4.1 model
        model: 'claude-opus-4-1-20250805',

        maxTurns: 100,

        // Use Claude Code preset with testing context
        systemPrompt: {
          type: 'preset' as const,
          preset: 'claude_code' as const,
          append: `You are an integration testing specialist testing implemented features.
Your current working directory (pwd) is: ${input.worktreePath}
${input.testingInstructions ? `\nProject-specific testing instructions:\n${input.testingInstructions}` : ''}
${input.projectMetadata ? `\nProject testing configuration available:\n- Backend path: ${input.projectMetadata.backendPath || 'Not specified'}\n- Start command: ${input.projectMetadata.startCommand || 'Not specified'}\n- Test port: ${input.projectMetadata.testPort || 'Not specified'}` : ''}`
        },

        permissionMode: 'bypassPermissions' as const
      };

      const queryGenerator = query({
        prompt: prompt,
        options: queryOptions
      });

      this.logger.log('Running integration tests with Claude Agent SDK...');

      // Collect all messages from the generator
      let report = '';
      let messageCount = 0;

      for await (const message of queryGenerator) {
        messageCount++;
        this.logger.debug(`Processing message ${messageCount} - Type: ${message.type}`);

        // Extract text from assistant messages
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

      this.logger.log(`Integration testing completed for ticket ${input.ticketKey} after ${messageCount} messages`);
      return report.trim();

    } catch (error) {
      this.logger.error(`Integration testing failed: ${error.message}`, error.stack);
      throw new Error(`Integration testing failed: ${error.message}`);
    }
  }

  /**
   * Parse the test report to extract structured results
   * This is a helper method to convert the text report into structured data
   */
  parseTestReport(report: string): Partial<TestingResult> {
    try {
      // Basic parsing logic - can be enhanced based on actual report format
      const result: Partial<TestingResult> = {
        fullReport: report,
        summary: {
          totalEndpoints: 0,
          passedEndpoints: 0,
          failedEndpoints: 0,
          averageResponseTime: 0,
          databaseOperations: 0,
          allPassed: false,
          overallStatus: 'failed'
        }
      };

      // Parse server status
      if (report.includes('Server Status: Running')) {
        result.serverStatus = 'already_running';
      } else if (report.includes('Server started successfully')) {
        result.serverStatus = 'started';
      } else if (report.includes('Failed to start server')) {
        result.serverStatus = 'failed';
      }

      // Parse port and PID
      const portMatch = report.match(/Port:\s*(\d+)/);
      if (portMatch) {
        result.serverPort = parseInt(portMatch[1]);
      }

      const pidMatch = report.match(/PID:\s*(\d+)/);
      if (pidMatch) {
        result.serverPid = parseInt(pidMatch[1]);
      }

      // Parse cleanup status
      if (report.includes('Server Stopped: Yes')) {
        result.cleanupStatus = 'success';
      } else if (report.includes('Server Stopped: No')) {
        result.cleanupStatus = 'failed';
      }

      // Parse test summary
      const totalMatch = report.match(/Total Endpoints Tested:\s*(\d+)/);
      if (totalMatch && result.summary) {
        result.summary.totalEndpoints = parseInt(totalMatch[1]);
      }

      const passedMatch = report.match(/Passed:\s*(\d+)/);
      if (passedMatch && result.summary) {
        result.summary.passedEndpoints = parseInt(passedMatch[1]);
      }

      const failedMatch = report.match(/Failed:\s*(\d+)/);
      if (failedMatch && result.summary) {
        result.summary.failedEndpoints = parseInt(failedMatch[1]);
      }

      // Determine overall status
      if (result.summary) {
        if (result.summary.failedEndpoints === 0 && result.summary.totalEndpoints > 0) {
          result.summary.allPassed = true;
          result.summary.overallStatus = 'success';
        } else if (result.summary.passedEndpoints > 0) {
          result.summary.overallStatus = 'partial';
        }
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to parse test report: ${error.message}`);
      return {
        fullReport: report,
        summary: {
          totalEndpoints: 0,
          passedEndpoints: 0,
          failedEndpoints: 0,
          averageResponseTime: 0,
          databaseOperations: 0,
          allPassed: false,
          overallStatus: 'failed'
        }
      };
    }
  }
}