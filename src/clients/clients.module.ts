import { Module } from '@nestjs/common';
import { JiraClient } from './jira.client';
import { GithubClient } from './github.client';
import { GitlabClient } from './gitlab.client';
import { AzureLoggingClient } from './azure-logging.client';

@Module({
  providers: [JiraClient, GithubClient, GitlabClient, AzureLoggingClient],
  exports: [JiraClient, GithubClient, GitlabClient, AzureLoggingClient],
})
export class ClientsModule {}