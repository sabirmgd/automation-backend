import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TasksService } from './tasks.service';
import { Task, TaskStatus, TaskPriority } from './entities/task.entity';
import { TaskLink, TaskLinkType } from './entities/task-link.entity';
import { LinkTaskDto } from './dto/link-task.dto';

@Injectable()
export class TaskIntegrationService {
  private readonly logger = new Logger(TaskIntegrationService.name);

  constructor(
    private readonly tasksService: TasksService,
    @InjectRepository(TaskLink)
    private taskLinkRepository: Repository<TaskLink>,
  ) {}

  async linkJiraTicket(
    taskId: string,
    jiraTicketId: string,
    jiraData?: {
      url?: string;
      title?: string;
      status?: string;
      priority?: string;
      assignee?: string;
    },
  ): Promise<TaskLink> {
    this.logger.log(`Linking task ${taskId} to Jira ticket ${jiraTicketId}`);

    const linkDto: LinkTaskDto = {
      linkType: TaskLinkType.JIRA_TICKET,
      externalId: jiraTicketId,
      externalUrl: jiraData?.url,
      title: jiraData?.title,
      status: jiraData?.status,
      platform: 'jira',
      metadata: {
        priority: jiraData?.priority,
        assignee: jiraData?.assignee,
      },
    };

    const link = await this.tasksService.addLink(taskId, linkDto);

    if (jiraData?.status) {
      await this.syncTaskStatusFromJira(taskId, jiraData.status);
    }

    return link;
  }

  async linkPullRequest(
    taskId: string,
    pullRequestId: string,
    prData?: {
      url?: string;
      title?: string;
      status?: string;
      platform?: string;
      author?: string;
      branch?: string;
    },
  ): Promise<TaskLink> {
    this.logger.log(`Linking task ${taskId} to PR ${pullRequestId}`);

    const linkDto: LinkTaskDto = {
      linkType: TaskLinkType.PULL_REQUEST,
      externalId: pullRequestId,
      externalUrl: prData?.url,
      title: prData?.title,
      status: prData?.status,
      platform: prData?.platform || 'github',
      metadata: {
        author: prData?.author,
        branch: prData?.branch,
      },
    };

    const link = await this.tasksService.addLink(taskId, linkDto);

    if (prData?.status) {
      await this.syncTaskStatusFromPR(taskId, prData.status);
    }

    return link;
  }

  async syncTaskStatusFromJira(taskId: string, jiraStatus: string): Promise<Task> {
    const taskStatus = this.mapJiraStatusToTaskStatus(jiraStatus);
    if (taskStatus) {
      return await this.tasksService.updateTaskStatus(taskId, taskStatus);
    }
    return await this.tasksService.findOne(taskId);
  }

  async syncTaskStatusFromPR(taskId: string, prStatus: string): Promise<Task> {
    const taskStatus = this.mapPRStatusToTaskStatus(prStatus);
    if (taskStatus) {
      return await this.tasksService.updateTaskStatus(taskId, taskStatus);
    }
    return await this.tasksService.findOne(taskId);
  }

  private mapJiraStatusToTaskStatus(jiraStatus: string): TaskStatus | null {
    const statusMap: Record<string, TaskStatus> = {
      'To Do': TaskStatus.TODO,
      'Open': TaskStatus.TODO,
      'Backlog': TaskStatus.TODO,
      'In Progress': TaskStatus.IN_PROGRESS,
      'In Development': TaskStatus.IN_PROGRESS,
      'In Review': TaskStatus.IN_REVIEW,
      'Code Review': TaskStatus.IN_REVIEW,
      'Testing': TaskStatus.IN_REVIEW,
      'Done': TaskStatus.DONE,
      'Closed': TaskStatus.DONE,
      'Resolved': TaskStatus.DONE,
      'Blocked': TaskStatus.BLOCKED,
      'Cancelled': TaskStatus.CANCELLED,
      'Won\'t Do': TaskStatus.CANCELLED,
    };

    return statusMap[jiraStatus] || null;
  }

  private mapPRStatusToTaskStatus(prStatus: string): TaskStatus | null {
    const statusMap: Record<string, TaskStatus> = {
      'open': TaskStatus.IN_REVIEW,
      'draft': TaskStatus.IN_PROGRESS,
      'merged': TaskStatus.DONE,
      'closed': TaskStatus.CANCELLED,
      'approved': TaskStatus.IN_REVIEW,
      'changes_requested': TaskStatus.IN_PROGRESS,
    };

    return statusMap[prStatus.toLowerCase()] || null;
  }

  async getLinkedJiraTickets(taskId: string): Promise<TaskLink[]> {
    return await this.taskLinkRepository.find({
      where: {
        taskId,
        linkType: TaskLinkType.JIRA_TICKET,
      },
      order: { createdAt: 'DESC' },
    });
  }

  async getLinkedPullRequests(taskId: string): Promise<TaskLink[]> {
    return await this.taskLinkRepository.find({
      where: {
        taskId,
        linkType: TaskLinkType.PULL_REQUEST,
      },
      order: { createdAt: 'DESC' },
    });
  }

  async createTaskFromJiraTicket(
    projectId: string,
    jiraTicket: {
      id: string;
      key: string;
      summary: string;
      description?: string;
      status: string;
      priority?: string;
      assignee?: string;
      reporter?: string;
      dueDate?: string;
      labels?: string[];
    },
  ): Promise<Task> {
    this.logger.log(`Creating task from Jira ticket ${jiraTicket.key}`);

    const task = await this.tasksService.create({
      title: `[${jiraTicket.key}] ${jiraTicket.summary}`,
      description: jiraTicket.description,
      status: this.mapJiraStatusToTaskStatus(jiraTicket.status) || TaskStatus.TODO,
      priority: this.mapJiraPriorityToTaskPriority(jiraTicket.priority) as TaskPriority,
      assignee: jiraTicket.assignee,
      reporter: jiraTicket.reporter,
      dueDate: jiraTicket.dueDate,
      labels: jiraTicket.labels,
      projectId,
      metadata: {
        source: 'jira',
        jiraKey: jiraTicket.key,
        jiraId: jiraTicket.id,
      },
    });

    await this.linkJiraTicket(task.id, jiraTicket.key, {
      url: `https://your-domain.atlassian.net/browse/${jiraTicket.key}`,
      title: jiraTicket.summary,
      status: jiraTicket.status,
      priority: jiraTicket.priority,
      assignee: jiraTicket.assignee,
    });

    return task;
  }

  private mapJiraPriorityToTaskPriority(jiraPriority?: string): string {
    const priorityMap: Record<string, string> = {
      'Highest': 'critical',
      'High': 'high',
      'Medium': 'medium',
      'Low': 'low',
      'Lowest': 'low',
    };

    return priorityMap[jiraPriority || 'Medium'] || 'medium';
  }

  async syncAllTasksWithJira(projectId: string): Promise<void> {
    this.logger.log(`Syncing all tasks with Jira for project ${projectId}`);

    const tasks = await this.tasksService.findByProject(projectId, {});

    for (const task of tasks) {
      const jiraLinks = await this.getLinkedJiraTickets(task.id);
      for (const link of jiraLinks) {
        if (link.status) {
          await this.syncTaskStatusFromJira(task.id, link.status);
        }
      }
    }

    this.logger.log(`Sync completed for ${tasks.length} tasks`);
  }
}