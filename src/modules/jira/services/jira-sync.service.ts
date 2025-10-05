import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import JiraClient from 'jira-client';
import { JiraAccount, JiraBoard, JiraUser, JiraProject } from '../entities';
import { JiraAccountService } from './jira-account.service';
import { JiraTicketService } from './jira-ticket.service';

@Injectable()
export class JiraSyncService {
  private readonly logger = new Logger(JiraSyncService.name);

  constructor(
    @InjectRepository(JiraAccount)
    private readonly accountRepository: Repository<JiraAccount>,
    @InjectRepository(JiraBoard)
    private readonly boardRepository: Repository<JiraBoard>,
    @InjectRepository(JiraUser)
    private readonly userRepository: Repository<JiraUser>,
    @InjectRepository(JiraProject)
    private readonly projectRepository: Repository<JiraProject>,
    private readonly accountService: JiraAccountService,
    private readonly ticketService: JiraTicketService,
    private readonly configService: ConfigService,
  ) {}

  private getJiraClient(account: any): JiraClient {
    return new JiraClient({
      protocol: 'https',
      host: account.jiraUrl.replace(/^https?:\/\//, ''),
      username: account.email,
      password: account.apiToken || account.encryptedApiToken,
      apiVersion: '3',
      strictSSL: true,
    });
  }

  async syncAccount(accountId: string): Promise<void> {
    this.logger.log(`Starting sync for account ${accountId}`);

    const account = await this.accountService.getDecryptedAccount(accountId);
    const client = this.getJiraClient(account);

    try {
      const currentUser = await client.getCurrentUser();
      await this.accountRepository.update(accountId, {
        currentUserAccountId: currentUser.accountId,
      });

      this.logger.log(`Current user: ${currentUser.displayName} (${currentUser.accountId})`);

      await this.syncProjects(client, account);
      await this.syncBoards(client, account);
      await this.accountService.updateLastSyncedAt(accountId);

      this.logger.log(`Completed sync for account ${accountId}`);
    } catch (error) {
      this.logger.error(`Failed to sync account ${accountId}:`, error);
      throw error;
    }
  }

  private async syncProjects(client: JiraClient, account: any): Promise<void> {
    this.logger.log(`Syncing projects for account ${account.accountName}`);

    const projects = await client.listProjects();

    for (const project of projects) {
      await this.projectRepository.upsert(
        {
          projectId: project.id,
          key: project.key,
          name: project.name,
          description: project.description,
          projectType: project.projectTypeKey,
          category: project.projectCategory?.name,
          leadAccountId: project.lead?.accountId,
          leadName: project.lead?.displayName,
          avatarUrl: project.avatarUrls?.['48x48'],
          accountId: account.id,
          style: project.style,
          lastSyncedAt: new Date(),
        },
        ['key'],
      );
    }
  }

  private async syncBoards(client: JiraClient, account: any): Promise<void> {
    this.logger.log(`Syncing boards for account ${account.accountName}`);

    const boards = await client.getAllBoards();

    for (const board of boards.values) {
      const project = board.location?.projectKey
        ? await this.projectRepository.findOne({
            where: { key: board.location.projectKey },
          })
        : null;

      await this.boardRepository.upsert(
        {
          boardId: board.id.toString(),
          name: board.name,
          type: board.type,
          projectKey: board.location?.projectKey,
          projectName: board.location?.projectName,
          accountId: account.id,
          projectId: project?.id,
          mainProjectId: account.projectId,
          lastSyncedAt: new Date(),
        },
        ['boardId'],
      );
    }
  }

  async syncProjectTickets(projectId: string, assigneeAccountId?: string): Promise<void> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: ['account', 'boards'],
    });

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Sync all boards in the project
    for (const board of project.boards) {
      await this.syncBoardTickets(board.id, assigneeAccountId);
    }
  }

  async syncSingleTicket(key: string, mainProjectId?: string, boardId?: string): Promise<any> {
    // Find any board that can access this ticket
    let board: JiraBoard | null = null;

    if (boardId) {
      board = await this.boardRepository.findOne({
        where: { id: boardId },
        relations: ['account'],
      });
    } else {
      // Find a board that might contain this ticket based on project key
      const projectKey = key.split('-')[0];
      board = await this.boardRepository.findOne({
        where: { projectKey },
        relations: ['account'],
      });
    }

    if (!board) {
      throw new Error(`No board found to sync ticket ${key}`);
    }

    const account = await this.accountService.getDecryptedAccount(board.account.id);
    const client = this.getJiraClient(account);

    this.logger.log(`Syncing single ticket ${key}`);

    try {
      // Fetch the specific ticket
      const issue = await client.findIssue(key);

      // Sync users
      await this.syncUser(issue.fields.assignee);
      await this.syncUser(issue.fields.reporter);

      const ticketData = {
        key: issue.key,
        summary: issue.fields.summary,
        description: issue.fields.description,
        issueType: issue.fields.issuetype.name,
        status: issue.fields.status.name,
        priority: issue.fields.priority?.name,
        resolution: issue.fields.resolution?.name,
        boardId: board.id,
        projectId: board.projectId,
        mainProjectId: mainProjectId || board.account?.projectId || board.mainProjectId,
        assigneeId: issue.fields.assignee?.accountId
          ? (await this.userRepository.findOne({
              where: { accountId: issue.fields.assignee.accountId },
            }))?.id
          : null,
        reporterId: issue.fields.reporter?.accountId
          ? (await this.userRepository.findOne({
              where: { accountId: issue.fields.reporter.accountId },
            }))?.id
          : null,
        labels: issue.fields.labels,
        components: issue.fields.components?.map((c: any) => c.name),
        storyPoints: issue.fields.customfield_10016,
        originalEstimate: issue.fields.timeoriginalestimate,
        remainingEstimate: issue.fields.timeestimate,
        timeSpent: issue.fields.timespent,
        epicKey: issue.fields.parent?.key,
        sprintId: issue.fields.sprint?.id,
        sprintName: issue.fields.sprint?.name,
        dueDate: issue.fields.duedate ? new Date(issue.fields.duedate) : null,
        jiraCreatedAt: new Date(issue.fields.created),
        jiraUpdatedAt: new Date(issue.fields.updated),
        lastSyncedAt: new Date(),
        customFields: this.extractCustomFields(issue.fields),
      };

      const ticket = await this.ticketService.upsertByKey(issue.key, ticketData);
      this.logger.log(`Synced ticket ${key}`);

      return ticket;
    } catch (error) {
      this.logger.error(`Failed to sync ticket ${key}:`, error);
      throw error;
    }
  }

  async syncBoardTickets(
    boardId: string,
    assigneeAccountId?: string,
    syncMode: 'assigned' | 'all' | 'custom' = 'assigned',
    customJql?: string
  ): Promise<void> {
    const board = await this.boardRepository.findOne({
      where: { id: boardId },
      relations: ['account'],
    });

    if (!board) {
      throw new Error(`Board ${boardId} not found`);
    }

    const account = await this.accountService.getDecryptedAccount(board.account.id);
    const client = this.getJiraClient(account);

    this.logger.log(`Syncing tickets for board ${board.name} (mode: ${syncMode})`);

    try {
      let jql: string;

      if (syncMode === 'custom' && customJql) {
        jql = customJql;
        this.logger.log(`Using custom JQL: ${jql}`);
      } else if (syncMode === 'all') {
        jql = `project = "${board.projectKey}"`;
        this.logger.log(`Syncing all tickets in project ${board.projectKey}`);
      } else {
        // Default to 'assigned' mode
        const currentUser = await client.getCurrentUser();
        const targetAssignee = assigneeAccountId || currentUser.accountId;
        jql = `assignee = "${targetAssignee}" AND project = "${board.projectKey}"`;
        this.logger.log(`Syncing tickets assigned to: ${assigneeAccountId ? assigneeAccountId : `${currentUser.displayName} (${currentUser.accountId})`}`);
      }

      this.logger.log(`JQL Query: ${jql}`);

      // Use the new /search/jql endpoint directly
      const issues = await client.doRequest(
        client.makeRequestHeader(
          client.makeUri({ pathname: '/search/jql' }),
          {
            method: 'POST',
            followAllRedirects: true,
            body: {
              jql: jql,
              maxResults: 100,
              fields: [
                'summary', 'status', 'assignee', 'reporter', 'priority',
                'created', 'updated', 'description', 'issuetype', 'project',
                'sprint', 'resolution', 'labels', 'components', 'parent',
                'timeoriginalestimate', 'timeestimate', 'timespent', 'duedate',
                'customfield_10016'
              ]
            }
          }
        )
      );

      for (const issue of issues.issues) {
        await this.syncUser(issue.fields.assignee);
        await this.syncUser(issue.fields.reporter);

        const ticketData = {
          key: issue.key,
          summary: issue.fields.summary,
          description: issue.fields.description,
          issueType: issue.fields.issuetype.name,
          status: issue.fields.status.name,
          priority: issue.fields.priority?.name,
          resolution: issue.fields.resolution?.name,
          boardId: board.id,
          projectId: board.projectId,
          mainProjectId: board.account?.projectId || board.mainProjectId,
          assigneeId: issue.fields.assignee?.accountId
            ? (await this.userRepository.findOne({
                where: { accountId: issue.fields.assignee.accountId },
              }))?.id
            : null,
          reporterId: issue.fields.reporter?.accountId
            ? (await this.userRepository.findOne({
                where: { accountId: issue.fields.reporter.accountId },
              }))?.id
            : null,
          labels: issue.fields.labels,
          components: issue.fields.components?.map((c: any) => c.name),
          storyPoints: issue.fields.customfield_10016,
          originalEstimate: issue.fields.timeoriginalestimate,
          remainingEstimate: issue.fields.timeestimate,
          timeSpent: issue.fields.timespent,
          epicKey: issue.fields.parent?.key,
          sprintId: issue.fields.sprint?.id,
          sprintName: issue.fields.sprint?.name,
          dueDate: issue.fields.duedate ? new Date(issue.fields.duedate) : null,
          jiraCreatedAt: new Date(issue.fields.created),
          jiraUpdatedAt: new Date(issue.fields.updated),
          lastSyncedAt: new Date(),
          customFields: this.extractCustomFields(issue.fields),
        };

        await this.ticketService.upsertByKey(issue.key, ticketData);
      }

      await this.boardRepository.update(board.id, { lastSyncedAt: new Date() });

      const syncDescription = syncMode === 'all'
        ? `all ${issues.issues.length} tickets`
        : syncMode === 'custom'
          ? `${issues.issues.length} tickets from custom query`
          : `${issues.issues.length} tickets assigned to user`;

      this.logger.log(`Synced ${syncDescription} for board ${board.name}`);
    } catch (error) {
      this.logger.error(`Failed to sync tickets for board ${board.name}:`, error);
      throw error;
    }
  }

  private async syncUser(userData: any): Promise<void> {
    if (!userData || !userData.accountId) return;

    await this.userRepository.upsert(
      {
        accountId: userData.accountId,
        displayName: userData.displayName,
        emailAddress: userData.emailAddress,
        avatarUrl: userData.avatarUrls?.['48x48'],
        isActive: userData.active,
        timeZone: userData.timeZone,
        accountType: userData.accountType,
      },
      ['accountId'],
    );
  }

  async syncAllUsers(jiraAccountId: string): Promise<JiraUser[]> {
    const account = await this.accountService.getDecryptedAccount(jiraAccountId);
    const client = this.getJiraClient(account);

    this.logger.log(`Syncing all users for account ${account.accountName}`);

    try {
      // Get all users (this might need pagination for large instances)
      const users = await client.searchUsers({ maxResults: 1000 });

      for (const userData of users) {
        await this.syncUser(userData);
      }

      this.logger.log(`Synced ${users.length} users for account ${account.accountName}`);

      // Return all users from the database
      return this.userRepository.find({
        order: { displayName: 'ASC' },
      });
    } catch (error) {
      this.logger.error(`Failed to sync users for account ${account.accountName}:`, error);
      throw error;
    }
  }

  private extractCustomFields(fields: any): any {
    const customFields: any = {};
    Object.keys(fields).forEach((key) => {
      if (key.startsWith('customfield_')) {
        customFields[key] = fields[key];
      }
    });
    return customFields;
  }

  async getJiraProjects(accountId: string): Promise<any[]> {
    const account = await this.accountService.getDecryptedAccount(accountId);
    const client = this.getJiraClient(account);
    return await client.listProjects();
  }

  async getJiraBoards(accountId: string): Promise<any> {
    const account = await this.accountService.getDecryptedAccount(accountId);
    const client = this.getJiraClient(account);
    const response = await client.getAllBoards();
    return response.values || [];
  }

  async getBoardsByAccount(accountId: string): Promise<JiraBoard[]> {
    return this.boardRepository.find({
      where: { accountId },
      relations: ['project', 'mainProject'],
      order: { name: 'ASC' },
    });
  }
}