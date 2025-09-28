import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { GitRepository } from './entities/git-repository.entity';
import { GitCredential } from './entities/git-credential.entity';
import { PullRequest } from './entities/pull-request.entity';
import { Project } from '../projects/project.entity';
import { JiraTicket } from '../modules/jira/entities/jira-ticket.entity';
import { GitService } from './services/git.service';
import { GitCredentialsService } from './services/git-credentials.service';
import { PullRequestService } from './services/pull-request.service';
import { GitController } from './controllers/git.controller';
import { GitCredentialsController } from './controllers/git-credentials.controller';
import { EncryptionService } from '../common/services/encryption.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GitRepository,
      GitCredential,
      PullRequest,
      Project,
      JiraTicket,
    ]),
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
  ],
  controllers: [GitController, GitCredentialsController],
  providers: [GitService, GitCredentialsService, PullRequestService, EncryptionService],
  exports: [GitService, GitCredentialsService, PullRequestService],
})
export class GitModule {}