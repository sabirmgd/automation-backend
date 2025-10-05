import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { JiraBoardService } from '../services/jira-board.service';
import { JiraSyncService } from '../services/jira-sync.service';
import { JiraBoard } from '../entities';

@Controller('jira/boards')
export class JiraBoardController {
  constructor(
    private readonly boardService: JiraBoardService,
    private readonly syncService: JiraSyncService,
  ) {}

  @Get()
  findAll(): Promise<JiraBoard[]> {
    return this.boardService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<JiraBoard> {
    return this.boardService.findOne(id);
  }

  @Get('account/:accountId')
  findByAccount(@Param('accountId') accountId: string): Promise<JiraBoard[]> {
    return this.boardService.findByAccount(accountId);
  }

  @Get('project/:projectId')
  findByProject(@Param('projectId') projectId: string): Promise<JiraBoard[]> {
    return this.boardService.findByProject(projectId);
  }

  @Get('main-project/:mainProjectId')
  findByMainProject(@Param('mainProjectId') mainProjectId: string): Promise<JiraBoard[]> {
    return this.boardService.findByMainProject(mainProjectId);
  }

  @Post(':id/sync')
  async syncBoard(
    @Param('id') id: string,
    @Body('assigneeAccountId') assigneeAccountId?: string,
    @Body('syncMode') syncMode?: 'assigned' | 'all' | 'custom',
    @Body('customJql') customJql?: string,
  ): Promise<{ message: string }> {
    await this.syncService.syncBoardTickets(id, assigneeAccountId, syncMode, customJql);
    const syncInfo = syncMode === 'all'
      ? ' for all tickets'
      : assigneeAccountId
        ? ` for assignee ${assigneeAccountId}`
        : ' for current user';
    return { message: `Board sync initiated successfully${syncInfo}` };
  }
}