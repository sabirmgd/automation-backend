import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan, MoreThan, Like } from 'typeorm';
import { Task, TaskStatus } from './entities/task.entity';
import { TaskLink } from './entities/task-link.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { LinkTaskDto, UnlinkTaskDto } from './dto/link-task.dto';
import { TaskFilterDto } from './dto/task-filter.dto';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    @InjectRepository(TaskLink)
    private taskLinkRepository: Repository<TaskLink>,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    const task = this.taskRepository.create(createTaskDto);
    return await this.taskRepository.save(task);
  }

  async findByProject(projectId: string, filterDto: TaskFilterDto) {
    const query = this.taskRepository.createQueryBuilder('task');
    query.where('task.projectId = :projectId', { projectId });

    // Add filtering based on filterDto properties
    if (filterDto.status) {
      query.andWhere('task.status = :status', { status: filterDto.status });
    }
    if (filterDto.priority) {
      query.andWhere('task.priority = :priority', { priority: filterDto.priority });
    }
    if (filterDto.search) {
      query.andWhere('task.title LIKE :search OR task.description LIKE :search', { search: `%${filterDto.search}%` });
    }

    return query.getMany();
  }

  async findOne(id: string): Promise<Task> {
    const task = await this.taskRepository.findOne({
      where: { id },
      relations: ['project', 'links'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    const task = await this.findOne(id);
    Object.assign(task, updateTaskDto);
    return await this.taskRepository.save(task);
  }

  async remove(id: string): Promise<void> {
    const task = await this.findOne(id);
    await this.taskRepository.remove(task);
  }

  async addLink(taskId: string, linkTaskDto: LinkTaskDto): Promise<TaskLink> {
    const task = await this.findOne(taskId);

    const existingLink = await this.taskLinkRepository.findOne({
      where: {
        taskId: task.id,
        linkType: linkTaskDto.linkType,
        externalId: linkTaskDto.externalId,
      },
    });

    if (existingLink) {
      throw new BadRequestException('This link already exists for the task');
    }

    const taskLink = this.taskLinkRepository.create({
      ...linkTaskDto,
      taskId: task.id,
    });

    return await this.taskLinkRepository.save(taskLink);
  }

  async removeLink(taskId: string, unlinkTaskDto: UnlinkTaskDto): Promise<void> {
    const task = await this.findOne(taskId);

    const taskLink = await this.taskLinkRepository.findOne({
      where: {
        taskId: task.id,
        linkType: unlinkTaskDto.linkType,
        externalId: unlinkTaskDto.externalId,
      },
    });

    if (!taskLink) {
      throw new NotFoundException('Link not found for this task');
    }

    await this.taskLinkRepository.remove(taskLink);
  }

  async getLinks(taskId: string): Promise<TaskLink[]> {
    const task = await this.findOne(taskId);
    return await this.taskLinkRepository.find({
      where: { taskId: task.id },
      order: { createdAt: 'DESC' },
    });
  }

  async getTasksByJiraTicket(jiraTicketId: string): Promise<Task[]> {
    const taskLinks = await this.taskLinkRepository.find({
      where: {
        linkType: 'jira_ticket' as any,
        externalId: jiraTicketId,
      },
      relations: ['task'],
    });

    return taskLinks.map(link => link.task);
  }

  async getTasksByPullRequest(pullRequestId: string): Promise<Task[]> {
    const taskLinks = await this.taskLinkRepository.find({
      where: {
        linkType: In(['pull_request', 'merge_request'] as any),
        externalId: pullRequestId,
      },
      relations: ['task'],
    });

    return taskLinks.map(link => link.task);
  }

  async updateTaskStatus(id: string, status: TaskStatus): Promise<Task> {
    const task = await this.findOne(id);
    task.status = status;

    if (status === TaskStatus.DONE && !task.completedAt) {
      task.completedAt = new Date();
    }

    if (status === TaskStatus.IN_PROGRESS && !task.startDate) {
      task.startDate = new Date();
    }

    return await this.taskRepository.save(task);
  }

  async bulkUpdateStatus(taskIds: string[], status: TaskStatus): Promise<Task[]> {
    const tasks = await this.taskRepository.find({
      where: { id: In(taskIds) },
    });

    const updatedTasks = tasks.map(task => {
      task.status = status;
      if (status === TaskStatus.DONE && !task.completedAt) {
        task.completedAt = new Date();
      }
      if (status === TaskStatus.IN_PROGRESS && !task.startDate) {
        task.startDate = new Date();
      }
      return task;
    });

    return await this.taskRepository.save(updatedTasks);
  }
}