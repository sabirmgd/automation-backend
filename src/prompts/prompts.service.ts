import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Prompt } from './prompt.entity';
import { CreatePromptDto } from './dto/create-prompt.dto';
import { UpdatePromptDto } from './dto/update-prompt.dto';
import { Project } from '../projects/project.entity';

@Injectable()
export class PromptsService {
  constructor(
    @InjectRepository(Prompt)
    private promptRepository: Repository<Prompt>,
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
  ) {}

  async create(createPromptDto: CreatePromptDto): Promise<Prompt> {
    if (createPromptDto.projectId) {
      const project = await this.projectRepository.findOne({
        where: { id: createPromptDto.projectId },
      });
      if (!project) {
        throw new BadRequestException(`Project with ID ${createPromptDto.projectId} not found`);
      }
    }

    const existingPrompt = await this.promptRepository.findOne({
      where: {
        name: createPromptDto.name,
        projectId: createPromptDto.projectId || null,
      },
    });

    if (existingPrompt) {
      throw new BadRequestException(
        `Prompt with name "${createPromptDto.name}" already exists in this scope`
      );
    }

    const prompt = this.promptRepository.create(createPromptDto);
    return await this.promptRepository.save(prompt);
  }

  async findAll(projectId?: string): Promise<Prompt[]> {
    const where: any = {};
    if (projectId !== undefined) {
      where.projectId = projectId;
    }

    return await this.promptRepository.find({
      where,
      order: { name: 'ASC' },
      relations: ['project'],
    });
  }

  async findOne(id: string): Promise<Prompt> {
    const prompt = await this.promptRepository.findOne({
      where: { id },
      relations: ['project'],
    });

    if (!prompt) {
      throw new NotFoundException(`Prompt with ID ${id} not found`);
    }

    return prompt;
  }

  async getPromptByName(name: string, projectId?: string): Promise<Prompt> {
    if (projectId) {
      const projectPrompt = await this.promptRepository.findOne({
        where: { name, projectId },
        relations: ['project'],
      });

      if (projectPrompt) {
        return projectPrompt;
      }
    }

    const globalPrompt = await this.promptRepository.findOne({
      where: { name, projectId: null },
      relations: ['project'],
    });

    if (!globalPrompt) {
      throw new NotFoundException(
        projectId
          ? `Prompt with name "${name}" not found in project or globally`
          : `Global prompt with name "${name}" not found`
      );
    }

    return globalPrompt;
  }

  async getPromptByNameAndProject(name: string, projectId?: string): Promise<Prompt> {
    return this.getPromptByName(name, projectId);
  }

  async findByProject(projectId: string): Promise<Prompt[]> {
    return await this.promptRepository.find({
      where: { projectId },
      order: { name: 'ASC' },
      relations: ['project'],
    });
  }

  async findGlobalPrompts(): Promise<Prompt[]> {
    return await this.promptRepository.find({
      where: { projectId: null },
      order: { name: 'ASC' },
    });
  }

  async update(id: string, updatePromptDto: UpdatePromptDto): Promise<Prompt> {
    const prompt = await this.findOne(id);

    if (updatePromptDto.projectId !== undefined) {
      if (updatePromptDto.projectId) {
        const project = await this.projectRepository.findOne({
          where: { id: updatePromptDto.projectId },
        });
        if (!project) {
          throw new BadRequestException(`Project with ID ${updatePromptDto.projectId} not found`);
        }
      }

      const newName = updatePromptDto.name || prompt.name;
      const existingPrompt = await this.promptRepository.findOne({
        where: {
          name: newName,
          projectId: updatePromptDto.projectId || null,
        },
      });

      if (existingPrompt && existingPrompt.id !== id) {
        throw new BadRequestException(
          `Prompt with name "${newName}" already exists in this scope`
        );
      }
    }

    Object.assign(prompt, updatePromptDto);
    return await this.promptRepository.save(prompt);
  }

  async remove(id: string): Promise<void> {
    const prompt = await this.findOne(id);
    await this.promptRepository.remove(prompt);
  }
}