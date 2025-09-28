import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import JiraClientLib from 'jira-client';

@Injectable()
export class JiraClient {
  private readonly logger = new Logger(JiraClient.name);
  private jiraClient: any;

  constructor(private readonly configService: ConfigService) {
    const jiraConfig = {
      protocol: this.configService.get('jira.protocol', 'https'),
      host: this.configService.get('jira.host'),
      username: this.configService.get('jira.username'),
      password: this.configService.get('jira.apiToken'),
      apiVersion: '2',
      strictSSL: true,
    };

    this.jiraClient = new JiraClientLib(jiraConfig);
  }

  async getMyAssignedTicketsFromBoard(boardId: number) {
    try {
      const currentUser = await this.jiraClient.getCurrentUser();
      const jql = `assignee = "${currentUser.accountId}" AND sprint in openSprints() AND project = (SELECT project FROM board WHERE id = ${boardId})`;

      const searchResult = await this.jiraClient.searchJira(jql, {
        fields: [
          'summary',
          'status',
          'assignee',
          'priority',
          'created',
          'updated',
          'description',
          'issuetype',
          'project',
          'sprint',
        ],
        maxResults: 100,
        startAt: 0,
      });

      return {
        total: searchResult.total,
        issues: searchResult.issues.map((issue: any) => ({
          key: issue.key,
          id: issue.id,
          summary: issue.fields.summary,
          status: issue.fields.status?.name,
          priority: issue.fields.priority?.name,
          type: issue.fields.issuetype?.name,
          created: issue.fields.created,
          updated: issue.fields.updated,
          description: issue.fields.description,
          project: {
            key: issue.fields.project?.key,
            name: issue.fields.project?.name,
          },
          assignee: {
            displayName: issue.fields.assignee?.displayName,
            emailAddress: issue.fields.assignee?.emailAddress,
          },
        })),
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch assigned tickets from board ${boardId}`,
        error,
      );
      throw error;
    }
  }
}