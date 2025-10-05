import { Controller, Get, Param, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JiraUser } from '../entities';
import { JiraSyncService } from '../services/jira-sync.service';

@Controller('jira/users')
export class JiraUserController {
  constructor(
    @InjectRepository(JiraUser)
    private readonly userRepository: Repository<JiraUser>,
    private readonly syncService: JiraSyncService,
  ) {}

  @Get()
  async findAll(): Promise<JiraUser[]> {
    return this.userRepository.find({
      order: { displayName: 'ASC' },
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<JiraUser> {
    return this.userRepository.findOneOrFail({ where: { id } });
  }

  @Get('account/:accountId')
  async findByAccountId(@Param('accountId') accountId: string): Promise<JiraUser> {
    return this.userRepository.findOneOrFail({ where: { accountId } });
  }

  @Get('search')
  async searchUsers(@Query('q') query: string): Promise<JiraUser[]> {
    if (!query) {
      return this.findAll();
    }

    return this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.displayName) LIKE LOWER(:query)', { query: `%${query}%` })
      .orWhere('LOWER(user.emailAddress) LIKE LOWER(:query)', { query: `%${query}%` })
      .orderBy('user.displayName', 'ASC')
      .getMany();
  }

  @Get('sync/:jiraAccountId')
  async syncUsersFromJira(@Param('jiraAccountId') jiraAccountId: string): Promise<JiraUser[]> {
    return this.syncService.syncAllUsers(jiraAccountId);
  }
}