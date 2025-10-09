import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull, MoreThan } from 'typeorm';
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

    // Check for existing session
    const existingSession = await this.getExistingSession(ticket.id);

    if (existingSession && !existingSession.hasNewUserComments) {
      console.log('Session exists with no new user comments - skipping analysis');
      return {
        projectId: project.id,
        projectName: project.name,
        ticketId: ticket.id,
        ticketKey: ticket.key,
        status: 'up-to-date',
        message: 'Analysis is already up to date. Add a comment to continue the conversation.',
      };
    }

    const analysisType = existingSession?.hasNewUserComments ? 'resume' : 'new';
    console.log(`Analysis type: ${analysisType}`);
    if (existingSession) {
      console.log(`Resuming session: ${existingSession.sessionId}`);
    }

    // Start the analysis in the background
    this.runAnalysisInBackground(
      project,
      ticket,
      projectId,
      existingSession?.sessionId || null,
      analysisType === 'resume',
    ).catch((error) => {
      console.error('Background analysis failed:', error);
    });

    // Return immediately
    return {
      projectId: project.id,
      projectName: project.name,
      ticketId: ticket.id,
      ticketKey: ticket.key,
      status: 'processing',
      message: analysisType === 'resume'
        ? 'Continuing conversation in background...'
        : 'Analysis started in background. It may take up to 10 minutes.',
    };
  }

  private async runAnalysisInBackground(
    project: any,
    ticket: any,
    projectId: string,
    existingSessionId: string | null,
    isResume: boolean,
  ): Promise<void> {
    console.log(`\n=== Running analysis for ${ticket.key} in background ===`);
    console.log('Starting at:', new Date().toISOString());
    console.log('Mode:', isResume ? 'RESUME' : 'NEW SESSION');

    const cwd = project.localPath || process.cwd();

    let analysisPrompt: string;
    let sessionId: string | null = existingSessionId;

    if (isResume) {
      // For resume, just get the latest user note
      const userNote = await this.getLatestUserNote(ticket.id);
      if (!userNote) {
        console.error('No user note found for resume');
        return;
      }

      const promptBuilder = new CreatePreliminaryAnalysisPromptsBuilder()
        .setTicket(ticket);

      analysisPrompt = promptBuilder.buildUserNotePrompt(userNote);
      console.log('Resume prompt (user note only):', analysisPrompt.substring(0, 200));
    } else {
      // For new session, build full context
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

      analysisPrompt = promptBuilder.buildPrompt();
      console.log('Full prompt length:', analysisPrompt.length, 'characters');
    }

    console.log('Executing Claude Analysis...');
    console.log('Working Directory:', cwd);

    try {
      console.log('Calling executeClaudeWithFile at:', new Date().toISOString());

      // Execute Claude with resume option if applicable
      const result = await this.executeClaudeWithFile(
        analysisPrompt,
        cwd,
        sessionId,
      );

      console.log('Got result from executeClaudeWithFile at:', new Date().toISOString());
      console.log('Result length:', result.analysisText.length, 'characters');

      // Extract session ID if it's a new session
      if (!isResume && result.sessionId) {
        sessionId = result.sessionId;
        console.log('New session ID:', sessionId);
      }

      // Store the analysis as a hidden comment with session ID
      const hiddenComment = this.hiddenCommentRepository.create({
        ticketId: ticket.id,
        content: result.analysisText,
        authorType: AuthorType.AI,
        authorName: isResume
          ? 'Claude Opus 4.1 - Continued Analysis'
          : 'Claude Opus 4.1 - Preliminary Analysis',
        sessionId: sessionId,
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

      // Store error as hidden comment (preserve session ID if resuming)
      const errorComment = this.hiddenCommentRepository.create({
        ticketId: ticket.id,
        content: `Analysis failed: ${error.message}`,
        authorType: AuthorType.AI,
        authorName: 'Claude Opus 4.1 - Error',
        sessionId: existingSessionId, // Preserve session ID for continuity
      });

      await this.hiddenCommentRepository.save(errorComment);
    }
  }

  private async getExistingSession(ticketId: string): Promise<{ sessionId: string; hasNewUserComments: boolean } | null> {
    // Get the latest AI comment with a session ID
    const latestAIComment = await this.hiddenCommentRepository.findOne({
      where: {
        ticketId,
        authorType: AuthorType.AI,
        sessionId: Not(IsNull()),
      },
      order: { createdAt: 'DESC' },
    });

    if (!latestAIComment) {
      return null;
    }

    // Check if there are user comments after this AI comment
    const newerUserComment = await this.hiddenCommentRepository.findOne({
      where: {
        ticketId,
        authorType: AuthorType.USER,
        createdAt: MoreThan(latestAIComment.createdAt),
      },
    });

    return {
      sessionId: latestAIComment.sessionId,
      hasNewUserComments: !!newerUserComment,
    };
  }

  private async getLatestUserNote(ticketId: string): Promise<string | null> {
    const latestUserComment = await this.hiddenCommentRepository.findOne({
      where: {
        ticketId,
        authorType: AuthorType.USER,
      },
      order: { createdAt: 'DESC' },
    });

    return latestUserComment?.content || null;
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

  private async executeClaudeWithFile(
    fullPrompt: string,
    cwd: string,
    resumeSessionId: string | null = null,
  ): Promise<{ analysisText: string; sessionId: string | null }> {
    try {
      console.log('Using Claude SDK for analysis...');
      console.log('Working directory:', cwd);
      console.log('Prompt length:', fullPrompt.length);

      // Split the prompt to extract system context
      const promptLines = fullPrompt.split('\n');

      // Check for different markers based on whether we're resuming
      const requestMarkers = [
        'MISSION: Perform a preliminary analysis',
        '=== CONTINUATION REQUEST ==='
      ];

      let requestIndex = -1;
      for (const marker of requestMarkers) {
        const index = promptLines.findIndex(line => line.includes(marker));
        if (index >= 0) {
          requestIndex = index;
          break;
        }
      }

      let systemAppend: string;
      let mainPrompt: string;

      if (requestIndex > 0) {
        // Everything before the marker is additional system context
        systemAppend = promptLines.slice(0, requestIndex).join('\n');
        mainPrompt = promptLines.slice(requestIndex).join('\n');
      } else {
        systemAppend = '';
        mainPrompt = fullPrompt;
      }

      console.log('System append length:', systemAppend.length);
      console.log('Main prompt length:', mainPrompt.length);

      if (resumeSessionId) {
        console.log('Resuming session:', resumeSessionId);
      }

      // Use the Claude SDK with planning mode and restricted tools
      // This simulates running Claude Code with project configuration
      const queryOptions: any = {
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
      };

      // Add resume option if session ID provided
      if (resumeSessionId) {
        queryOptions.resume = resumeSessionId;
      }

      const queryGenerator = query({
        prompt: mainPrompt,
        options: queryOptions
      });

      console.log('Processing Claude SDK messages...');

      // Collect all messages from the generator
      let analysisText = '';
      let messageCount = 0;
      let capturedSessionId: string | null = null;
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

        // Check for system messages (initialization) and capture session ID
        if (message.type === 'system') {
          console.log('System message subtype:', (message as any).subtype);
          if ((message as any).subtype === 'init') {
            // Capture session ID from init message
            if ((message as any).session_id) {
              capturedSessionId = (message as any).session_id;
              console.log('✅ Captured session ID:', capturedSessionId);
            }
            console.log('Init details:', {
              session_id: (message as any).session_id,
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
      console.log('Session ID:', capturedSessionId || resumeSessionId);

      if (analysisText.length < 500) {
        console.warn('⚠️ Output seems short, first 200 chars:', analysisText.substring(0, 200));
      }

      return {
        analysisText: analysisText.trim(),
        sessionId: capturedSessionId || resumeSessionId
      };
    } catch (error: any) {
      console.error('❌ Claude SDK analysis failed:', error);
      throw new Error(`Claude analysis failed: ${error.message}`);
    }
  }

}