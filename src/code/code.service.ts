import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommandClient } from '../clients/command/command.client';
import { JiraTicketService } from '../modules/jira/services/jira-ticket.service';
import { ProjectsService } from '../projects/projects.service';
import { PromptsService } from '../prompts/prompts.service';
import { CommandResult } from '../clients/command/command.types';
import { mustPrompts } from '../prompts/must-prompts';
import { CreatePreliminaryAnalysisPromptsBuilder } from './create-preliminary-analysis-prompts.builder';
import { HiddenComment, AuthorType } from '../modules/jira/entities/hidden-comment.entity';
import { query } from '@anthropic-ai/claude-agent-sdk';

@Injectable()
export class CodeService {
  constructor(
    private readonly jiraTicketService: JiraTicketService,
    private readonly projectsService: ProjectsService,
    private readonly promptsService: PromptsService,
    private readonly commandClient: CommandClient,
    @InjectRepository(HiddenComment)
    private readonly hiddenCommentRepository: Repository<HiddenComment>,
  ) {}

  async executeCommand(
    projectId: string,
    ticketId: string,
    commandString: string,
  ): Promise<CommandResult> {
    const project = await this.projectsService.findOne(projectId);

    // Verify ticket exists
    await this.getTicketByIdOrKey(ticketId);

    const cwd = project.localPath || process.cwd();

    const result = await this.commandClient
      .command(commandString)
      .inDirectory(cwd)
      .withTimeout(30000)
      .run();

    return result;
  }

  async createPreliminaryAnalysis(
    projectId: string,
    ticketId: string,
  ): Promise<any> {
    const project = await this.projectsService.findOne(projectId);
    const ticket = await this.getTicketByIdOrKey(ticketId);

    console.log('=== PRELIMINARY ANALYSIS STARTED ===');
    console.log('Project Name:', project.name);
    console.log('Ticket Key:', ticket.key);

    // Start the analysis in the background
    this.runAnalysisInBackground(project, ticket, projectId).catch((error) => {
      console.error('Background analysis failed:', error);
    });

    // Return immediately
    return {
      projectId: project.id,
      projectName: project.name,
      ticketId: ticket.id,
      ticketKey: ticket.key,
      status: 'processing',
      message: 'Analysis started in background. It may take up to 10 minutes.',
    };
  }

  private async runAnalysisInBackground(
    project: any,
    ticket: any,
    projectId: string,
  ): Promise<void> {
    console.log(`\n=== Running analysis for ${ticket.key} in background ===`);
    console.log('Starting at:', new Date().toISOString());

    const cwd = project.localPath || process.cwd();

    // Get INSPECT_JIRA prompt
    let inspectJiraPromptContent = null;
    try {
      const prompt = await this.promptsService.getPromptByName(
        mustPrompts.INSPECT_JIRA,
        projectId,
      );
      inspectJiraPromptContent = prompt.content;
      console.log('INSPECT_JIRA Prompt Found');
    } catch (error) {
      console.log('INSPECT_JIRA Prompt Not Found');
    }

    // Get previous hidden comments for this ticket
    const hiddenComments = await this.hiddenCommentRepository.find({
      where: { ticketId: ticket.id },
      order: { createdAt: 'ASC' },
    });

    console.log(`Found ${hiddenComments.length} previous comments`);

    // Build the prompt using the builder
    const promptBuilder = new CreatePreliminaryAnalysisPromptsBuilder()
      .setProject(project)
      .setTicket(ticket)
      .setInspectJiraPrompt(inspectJiraPromptContent)
      .setHiddenComments(hiddenComments);

    const analysisPrompt = promptBuilder.buildPrompt();
    const command = promptBuilder.buildCommand(analysisPrompt);

    console.log('Executing Claude Analysis...');
    console.log('Working Directory:', cwd);
    console.log('Prompt length:', analysisPrompt.length, 'characters');
    console.log('First 100 chars of prompt:', analysisPrompt.substring(0, 100));
    console.log('Last 100 chars of prompt:', analysisPrompt.substring(analysisPrompt.length - 100));

    try {
      console.log('Calling executeClaudeWithFile at:', new Date().toISOString());

      // Execute Claude CLI with the actual analysis prompt
      const analysisResult = await this.executeClaudeWithFile(command, analysisPrompt, cwd);

      console.log('Got result from executeClaudeWithFile at:', new Date().toISOString());
      console.log('Result length:', analysisResult.length, 'characters');

      // Store the analysis as a hidden comment
      const hiddenComment = this.hiddenCommentRepository.create({
        ticketId: ticket.id,
        content: analysisResult,
        authorType: AuthorType.AI,
        authorName: 'Claude Opus 4.1 - Preliminary Analysis',
      });

      await this.hiddenCommentRepository.save(hiddenComment);

      console.log(`\n=== Analysis Complete for ${ticket.key} ===`);
      console.log('Analysis stored as hidden comment with ID:', hiddenComment.id);
      console.log('Completed at:', new Date().toISOString());
    } catch (error: any) {
      console.error(`\n=== Analysis Failed for ${ticket.key} ===`);
      console.error('Failed at:', new Date().toISOString());
      console.error('Error:', error.message);
      console.error('Error stack:', error.stack);

      // Store error as hidden comment
      const errorComment = this.hiddenCommentRepository.create({
        ticketId: ticket.id,
        content: `Analysis failed: ${error.message}`,
        authorType: AuthorType.AI,
        authorName: 'Claude Opus 4.1 - Error',
      });

      await this.hiddenCommentRepository.save(errorComment);
    }
  }

  async checkForNewAIComments(ticketIds: string[]): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {};

    for (const ticketId of ticketIds) {
      try {
        // Get the latest AI comment for this ticket
        const latestAIComment = await this.hiddenCommentRepository.findOne({
          where: {
            ticketId,
            authorType: AuthorType.AI,
          },
          order: {
            createdAt: 'DESC',
          },
        });

        // Get the latest user comment for this ticket
        const latestUserComment = await this.hiddenCommentRepository.findOne({
          where: {
            ticketId,
            authorType: AuthorType.USER,
          },
          order: {
            createdAt: 'DESC',
          },
        });

        // Check if there's an AI comment after the last user comment
        if (latestAIComment) {
          if (!latestUserComment) {
            // If there's an AI comment but no user comment, show the dot
            result[ticketId] = true;
          } else {
            // If AI comment is newer than user comment, show the dot
            result[ticketId] = latestAIComment.createdAt > latestUserComment.createdAt;
          }
        } else {
          result[ticketId] = false;
        }
      } catch (error) {
        console.error(`Error checking comments for ticket ${ticketId}:`, error);
        result[ticketId] = false;
      }
    }

    return result;
  }

  private async getTicketByIdOrKey(ticketId: string) {
    try {
      // Try as UUID first
      return await this.jiraTicketService.findOne(ticketId);
    } catch (error) {
      // If not found as UUID, try as Jira key
      try {
        return await this.jiraTicketService.findByKey(ticketId);
      } catch (keyError) {
        throw new NotFoundException(`Jira ticket with ID or key ${ticketId} not found`);
      }
    }
  }

  private async executeClaudeWithFile(_command: string[], fullPrompt: string, cwd: string): Promise<string> {
    try {
      console.log('Using Claude SDK for analysis...');
      console.log('Working directory:', cwd);
      console.log('Prompt length:', fullPrompt.length);

      // Split the prompt to extract system context
      const promptLines = fullPrompt.split('\n');
      const requestMarker = 'MISSION: Perform a preliminary analysis';
      const requestIndex = promptLines.findIndex(line => line.includes(requestMarker));

      let systemAppend: string;
      let mainPrompt: string;

      if (requestIndex > 0) {
        // Everything before the mission is additional system context
        systemAppend = promptLines.slice(0, requestIndex).join('\n');
        mainPrompt = promptLines.slice(requestIndex).join('\n');
      } else {
        systemAppend = '';
        mainPrompt = fullPrompt;
      }

      console.log('System append length:', systemAppend.length);
      console.log('Main prompt length:', mainPrompt.length);

      // Use the Claude SDK with planning mode and restricted tools
      // This simulates running Claude Code with project configuration
      const queryGenerator = query({
        prompt: mainPrompt,
        options: {
          // Allow only read and search tools (no modifications)
          allowedTools: ['Read', 'Grep', 'Glob', 'WebSearch'],

          // Set the working directory for the agent
          cwd: cwd,

          // Use Claude Opus 4.1 model
          model: 'claude-opus-4-1-20250805',

          maxTurns: 1000,
          // Use Claude Code preset with additional context
          systemPrompt: {
            type: 'preset' as const,
            preset: 'claude_code' as const,
            append: systemAppend || undefined
          },
          permissionMode : 'bypassPermissions' as const
        }
      });

      console.log('Processing Claude SDK messages...');

      // Collect all messages from the generator
      let analysisText = '';
      let messageCount = 0;

      for await (const message of queryGenerator) {
        messageCount++;
        console.log(`\n=== Message ${messageCount} ===`);
        console.log('Type:', message.type);

        // Log the full message for debugging
        console.log('Full message:', JSON.stringify(message, null, 2).substring(0, 1000));

        // Extract text from assistant messages
        if (message.type === 'assistant' && 'message' in message) {
          const content = message.message.content;
          console.log(`Assistant message content type: ${typeof content}, isArray: ${Array.isArray(content)}`);

          if (Array.isArray(content)) {
            for (const item of content) {
              if (item.type === 'text') {
                analysisText += item.text + '\n';
                console.log(`Added ${item.text.length} chars from message ${messageCount}`);
                console.log('Text preview:', item.text.substring(0, 200) + '...');
              }
            }
          } else {
            console.log('⚠️ Assistant message content is not an array:', content);
          }
        }

        // Check for system messages (initialization)
        if (message.type === 'system') {
          console.log('System message subtype:', (message as any).subtype);
          if ((message as any).subtype === 'init') {
            console.log('Init details:', {
              tools: (message as any).tools,
              model: (message as any).model,
              permissionMode: (message as any).permissionMode,
              cwd: (message as any).cwd
            });
          }
        }

        // Check for completion/result messages
        if (message.type === 'result') {
          console.log('🏁 Result message received:', {
            subtype: (message as any).subtype,
            isError: (message as any).is_error,
            numTurns: (message as any).num_turns,
            duration: (message as any).duration_ms
          });

          if ((message as any).subtype === 'error_max_turns') {
            console.warn('⚠️ Analysis stopped: Maximum turns reached');
          }

          if ((message as any).subtype === 'error_during_execution') {
            console.error('⚠️ Error during execution!');
          }
        }

        // Log streaming events
        if (message.type === 'stream_event') {
          console.log('Streaming event received...');
        }
      }

      console.log('✅ Claude SDK analysis completed');
      console.log(`Total messages processed: ${messageCount}`);
      console.log('Analysis length:', analysisText.length, 'characters');

      if (analysisText.length < 500) {
        console.warn('⚠️ Output seems short, first 200 chars:', analysisText.substring(0, 200));
      }

      return analysisText.trim();
    } catch (error: any) {
      console.error('❌ Claude SDK analysis failed:', error);
      throw new Error(`Claude analysis failed: ${error.message}`);
    }
  }

}