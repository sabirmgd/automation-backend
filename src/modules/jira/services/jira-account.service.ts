import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JiraAccount } from '../entities';
import { CreateJiraAccountDto, UpdateJiraAccountDto } from '../dto/jira-account.dto';
import { EncryptionService } from '../../../common/services/encryption.service';

@Injectable()
export class JiraAccountService {
  constructor(
    @InjectRepository(JiraAccount)
    private readonly jiraAccountRepository: Repository<JiraAccount>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async create(createDto: CreateJiraAccountDto): Promise<JiraAccount> {
    const existingAccount = await this.jiraAccountRepository.findOne({
      where: { accountName: createDto.accountName },
    });

    if (existingAccount) {
      throw new ConflictException('Account with this name already exists');
    }

    const account = this.jiraAccountRepository.create({
      ...createDto,
      encryptedApiToken: this.encryptionService.encrypt(createDto.apiToken),
    });

    return await this.jiraAccountRepository.save(account);
  }

  async findAll(projectId?: string): Promise<JiraAccount[]> {
    const where: any = {};
    if (projectId) {
      where.projectId = projectId;
    }

    return await this.jiraAccountRepository.find({
      where,
      relations: ['boards', 'jiraProjects'],
    });
  }

  async findOne(id: string): Promise<JiraAccount> {
    const account = await this.jiraAccountRepository.findOne({
      where: { id },
      relations: ['boards', 'jiraProjects'],
    });

    if (!account) {
      throw new NotFoundException(`Jira account with ID ${id} not found`);
    }

    return account;
  }

  async update(id: string, updateDto: UpdateJiraAccountDto): Promise<JiraAccount> {
    const account = await this.findOne(id);
    const updates: any = { ...updateDto };

    if (updateDto.apiToken) {
      updates.encryptedApiToken = this.encryptionService.encrypt(updateDto.apiToken);
      delete updates.apiToken;
    }

    Object.assign(account, updates);
    return await this.jiraAccountRepository.save(account);
  }

  async remove(id: string): Promise<void> {
    const result = await this.jiraAccountRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Jira account with ID ${id} not found`);
    }
  }

  async updateLastSyncedAt(id: string): Promise<void> {
    await this.jiraAccountRepository.update(id, {
      lastSyncedAt: new Date(),
    });
  }

  async getDecryptedAccount(id: string): Promise<JiraAccount & { apiToken: string }> {
    const account = await this.jiraAccountRepository
      .createQueryBuilder('account')
      .where('account.id = :id', { id })
      .addSelect('account.encryptedApiToken')
      .getOne();

    if (!account) {
      throw new NotFoundException(`Jira account with ID ${id} not found`);
    }

    const apiToken = this.encryptionService.decrypt(account.encryptedApiToken);

    return {
      ...account,
      apiToken,
    };
  }
}