import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JiraProject } from '../entities';
import { JiraSyncService } from '../services/jira-sync.service';

@Controller('jira/projects')
export class JiraProjectController {
  constructor(
    @InjectRepository(JiraProject)
    private readonly projectRepository: Repository<JiraProject>,
    private readonly syncService: JiraSyncService,
  ) {}

  @Get()
  async findAll(): Promise<JiraProject[]> {
    return this.projectRepository.find({
      relations: ['account', 'boards'],
      order: { name: 'ASC' },
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<JiraProject> {
    return this.projectRepository.findOneOrFail({
      where: { id },
      relations: ['account', 'boards', 'tickets'],
    });
  }

  @Get('account/:accountId')
  async findByAccount(@Param('accountId') accountId: string): Promise<JiraProject[]> {
    return this.projectRepository.find({
      where: { accountId },
      relations: ['boards'],
      order: { name: 'ASC' },
    });
  }

  @Post(':id/sync')
  async syncProject(
    @Param('id') id: string,
    @Body('assigneeAccountId') assigneeAccountId?: string,
  ): Promise<{ message: string; totalTickets: number }> {
    await this.syncService.syncProjectTickets(id, assigneeAccountId);

    // Count tickets for this project
    const project = await this.projectRepository.findOne({
      where: { id },
      relations: ['tickets'],
    });

    return {
      message: `Project sync completed successfully`,
      totalTickets: project?.tickets?.length || 0,
    };
  }

  @Get('key/:key')
  async findByKey(@Param('key') key: string): Promise<JiraProject> {
    return this.projectRepository.findOneOrFail({
      where: { key },
      relations: ['account', 'boards'],
    });
  }
}