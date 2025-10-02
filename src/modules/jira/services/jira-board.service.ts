import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JiraBoard } from '../entities';

@Injectable()
export class JiraBoardService {
  constructor(
    @InjectRepository(JiraBoard)
    private readonly boardRepository: Repository<JiraBoard>,
  ) {}

  async findAll(): Promise<JiraBoard[]> {
    return this.boardRepository.find({
      relations: ['account', 'project'],
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<JiraBoard> {
    const board = await this.boardRepository.findOne({
      where: { id },
      relations: ['account', 'project', 'tickets'],
    });

    if (!board) {
      throw new NotFoundException(`Jira board with ID "${id}" not found`);
    }

    return board;
  }

  async findByAccount(accountId: string): Promise<JiraBoard[]> {
    return this.boardRepository.find({
      where: { accountId },
      relations: ['project'],
      order: { name: 'ASC' },
    });
  }

  async findByProject(projectId: string): Promise<JiraBoard[]> {
    return this.boardRepository.find({
      where: { projectId },
      relations: ['account'],
      order: { name: 'ASC' },
    });
  }

  async findByMainProject(mainProjectId: string): Promise<JiraBoard[]> {
    return this.boardRepository.find({
      where: { mainProjectId },
      relations: ['account', 'project'],
      order: { name: 'ASC' },
    });
  }
}