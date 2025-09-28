import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, Like } from 'typeorm';
import { Project } from './project.entity';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
  ) {}

  async create(createProjectDto: CreateProjectDto) {
    const project = this.projectRepository.create(createProjectDto);
    return await this.projectRepository.save(project);
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    status?: string,
  ): Promise<{
    data: Project[];
    total: number;
    page: number;
    lastPage: number;
  }> {
    const skip = (page - 1) * limit;

    const where: FindManyOptions<Project>['where'] = {};

    if (search) {
      where.name = Like(`%${search}%`);
    }

    if (status) {
      where.status = status;
    }

    const [data, total] = await this.projectRepository.findAndCount({
      where,
      skip,
      take: limit,
      order: {
        createdAt: 'DESC',
      },
    });

    return {
      data,
      total,
      page,
      lastPage: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const project = await this.projectRepository.findOne({
      where: { id },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    return project;
  }

  async update(
    id: string,
    updateProjectDto: UpdateProjectDto,
  ) {
    const project = await this.findOne(id);

    Object.assign(project, updateProjectDto);

    return await this.projectRepository.save(project);
  }

  async remove(id: string) {
    const project = await this.findOne(id);
    await this.projectRepository.remove(project);
  }

  async findByStatus(status: string) {
    return await this.projectRepository.find({
      where: { status },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findByOwner(owner: string) {
    return await this.projectRepository.find({
      where: { owner },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findByTags(tags: string[]) {
    const projects = await this.projectRepository.find();
    return projects.filter(
      (project) =>
        project.tags && tags.some((tag) => project.tags.includes(tag)),
    );
  }
}