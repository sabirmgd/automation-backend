import { Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpCode, HttpStatus, Res, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { JiraTicketService } from '../services/jira-ticket.service';
import { JiraSyncService } from '../services/jira-sync.service';
import { CreateJiraTicketDto, UpdateJiraTicketDto, TicketFilterDto } from '../dto/jira-ticket.dto';
import { JiraCommentDto, JiraAttachmentDto, TicketDetailsDto } from '../dto/jira-comment.dto';
import { JiraTicket } from '../entities';

@Controller('jira/tickets')
export class JiraTicketController {
  constructor(
    private readonly jiraTicketService: JiraTicketService,
    private readonly jiraSyncService: JiraSyncService,
  ) {}

  @Post()
  create(@Body() createJiraTicketDto: CreateJiraTicketDto): Promise<JiraTicket> {
    return this.jiraTicketService.create(createJiraTicketDto);
  }

  @Get()
  findAll(
    @Query() filter: TicketFilterDto,
    @Query('mainProjectId') mainProjectId?: string,
  ): Promise<JiraTicket[]> {
    console.log('=== TICKET CONTROLLER: findAll called ===');
    console.log('Filter received:', JSON.stringify(filter, null, 2));
    console.log('MainProjectId:', mainProjectId);
    return this.jiraTicketService.findAll(filter, mainProjectId);
  }

  @Get('unanalyzed')
  getUnanalyzedTickets(@Query('boardId') boardId?: string): Promise<JiraTicket[]> {
    return this.jiraTicketService.getUnanalyzedTickets(boardId);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<JiraTicket> {
    return this.jiraTicketService.findOne(id);
  }

  @Get('key/:key')
  findByKey(@Param('key') key: string): Promise<JiraTicket> {
    return this.jiraTicketService.findByKey(key);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateJiraTicketDto: UpdateJiraTicketDto,
  ): Promise<JiraTicket> {
    return this.jiraTicketService.update(id, updateJiraTicketDto);
  }

  @Patch(':id/toggle-hidden')
  toggleHidden(@Param('id') id: string): Promise<JiraTicket> {
    return this.jiraTicketService.toggleHidden(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.jiraTicketService.remove(id);
  }

  @Get('board/:boardId')
  getTicketsByBoard(@Param('boardId') boardId: string): Promise<JiraTicket[]> {
    return this.jiraTicketService.getTicketsByBoard(boardId);
  }

  @Get('project/:projectId')
  getTicketsByProject(@Param('projectId') projectId: string): Promise<JiraTicket[]> {
    return this.jiraTicketService.getTicketsByProject(projectId);
  }

  @Post('board/:boardId/sync')
  async syncBoardTickets(
    @Param('boardId') boardId: string,
    @Body('assigneeAccountId') assigneeAccountId?: string,
    @Body('syncMode') syncMode?: 'assigned' | 'all' | 'custom',
    @Body('customJql') customJql?: string,
  ): Promise<{ message: string }> {
    await this.jiraSyncService.syncBoardTickets(boardId, assigneeAccountId, syncMode, customJql);
    const syncInfo = syncMode === 'all'
      ? ' for all tickets'
      : assigneeAccountId
        ? ` for assignee ${assigneeAccountId}`
        : ' for current user';
    return { message: `Board tickets sync initiated successfully${syncInfo}` };
  }

  @Post('key/:key/sync')
  async syncTicketByKey(
    @Param('key') key: string,
    @Body('mainProjectId') mainProjectId?: string,
    @Body('boardId') boardId?: string,
  ): Promise<{ ticket: JiraTicket; message: string }> {
    const ticket = await this.jiraSyncService.syncSingleTicket(key, mainProjectId, boardId);
    return {
      ticket,
      message: `Ticket ${key} synced successfully`
    };
  }

  @Get(':id/comments')
  getTicketComments(@Param('id') id: string): Promise<JiraCommentDto[]> {
    return this.jiraTicketService.getTicketComments(id);
  }

  @Get(':id/attachments')
  getTicketAttachments(@Param('id') id: string): Promise<JiraAttachmentDto[]> {
    return this.jiraTicketService.getTicketAttachments(id);
  }

  @Get(':id/details')
  getTicketDetails(@Param('id') id: string): Promise<TicketDetailsDto> {
    return this.jiraTicketService.getTicketDetails(id);
  }

  @Patch(':id/description')
  updateTicketDescription(
    @Param('id') id: string,
    @Body('description') description: string
  ): Promise<void> {
    return this.jiraTicketService.updateTicketDescription(id, description);
  }

  @Get(':ticketId/attachment/:attachmentId')
  async getAttachment(
    @Param('ticketId') ticketId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response
  ): Promise<void> {
    try {
      const attachment = await this.jiraTicketService.getAttachmentContent(ticketId, attachmentId);

      res.set({
        'Content-Type': attachment.mimeType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${attachment.filename}"`,
        'Cache-Control': 'public, max-age=3600',
      });

      res.send(attachment.content);
    } catch (error) {
      console.error('Failed to fetch attachment:', error);
      res.status(500).json({ message: 'Failed to fetch attachment' });
    }
  }

  @Get(':ticketId/attachment/:attachmentId/download')
  async downloadAttachment(
    @Param('ticketId') ticketId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response
  ): Promise<void> {
    try {
      const attachment = await this.jiraTicketService.getAttachmentContent(ticketId, attachmentId);

      res.set({
        'Content-Type': attachment.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${attachment.filename}"`,
      });

      res.send(attachment.content);
    } catch (error) {
      console.error('Failed to download attachment:', error);
      res.status(500).json({ message: 'Failed to download attachment' });
    }
  }
}