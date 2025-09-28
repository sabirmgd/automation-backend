import { Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { JiraAccountService } from '../services/jira-account.service';
import { JiraSyncService } from '../services/jira-sync.service';
import { CreateJiraAccountDto, UpdateJiraAccountDto } from '../dto/jira-account.dto';
import { JiraAccount, JiraBoard } from '../entities';

@Controller('jira/accounts')
export class JiraAccountController {
  constructor(
    private readonly jiraAccountService: JiraAccountService,
    private readonly jiraSyncService: JiraSyncService,
  ) {}

  @Post()
  create(@Body() createJiraAccountDto: CreateJiraAccountDto): Promise<JiraAccount> {
    return this.jiraAccountService.create(createJiraAccountDto);
  }

  @Get()
  findAll(@Query('projectId') projectId?: string): Promise<JiraAccount[]> {
    return this.jiraAccountService.findAll(projectId);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<JiraAccount> {
    return this.jiraAccountService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateJiraAccountDto: UpdateJiraAccountDto,
  ): Promise<JiraAccount> {
    return this.jiraAccountService.update(id, updateJiraAccountDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.jiraAccountService.remove(id);
  }

  @Post(':id/sync')
  async syncAccount(@Param('id') id: string): Promise<{ message: string }> {
    await this.jiraSyncService.syncAccount(id);
    return { message: 'Account sync initiated successfully' };
  }

  @Get(':id/projects')
  getProjects(@Param('id') id: string): Promise<any[]> {
    return this.jiraSyncService.getJiraProjects(id);
  }

  @Get(':id/boards')
  getBoards(@Param('id') id: string): Promise<JiraBoard[]> {
    return this.jiraSyncService.getBoardsByAccount(id);
  }
}