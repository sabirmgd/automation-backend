import { Module } from '@nestjs/common';
import { JiraClient } from './jira.client';
import { GithubClient } from './github.client';
import { GitlabClient } from './gitlab.client';

@Module({
  providers: [JiraClient, GithubClient, GitlabClient],
  exports: [JiraClient, GithubClient, GitlabClient],
})
export class ClientsModule {}