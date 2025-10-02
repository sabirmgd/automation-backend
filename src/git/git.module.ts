import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { GitRepository } from './entities/git-repository.entity';
import { GitCredential } from './entities/git-credential.entity';
import { PullRequest } from './entities/pull-request.entity';
import { ReviewComment } from './entities/review-comment.entity';
import { PullRequestDiagram } from './entities/pull-request-diagram.entity';
import { Release } from './entities/release.entity';
import { Pipeline } from './entities/pipeline.entity';
import { PipelineAnalysis } from './entities/pipeline-analysis.entity';
import { Job } from './entities/job.entity';
import { JobAnalysis } from './entities/job-analysis.entity';
import { Project } from '../projects/project.entity';
import { JiraTicket } from '../modules/jira/entities/jira-ticket.entity';
import { GitService } from './services/git.service';
import { GitCredentialsService } from './services/git-credentials.service';
import { PullRequestService } from './services/pull-request.service';
import { ReleaseService } from './services/release.service';
import { ReviewService } from './services/review.service';
import { DiagramService } from './services/diagram.service';
import { PipelineService } from './services/pipeline.service';
import { PipelineAnalysisService } from './services/pipeline-analysis.service';
import { JobAnalysisService } from './services/job-analysis.service';
import { GitController } from './controllers/git.controller';
import { GitCredentialsController } from './controllers/git-credentials.controller';
import { PullRequestController } from './controllers/pull-request.controller';
import { ReviewController } from './controllers/review.controller';
import { DiagramController } from './controllers/diagram.controller';
import { PipelineController } from './controllers/pipeline.controller';
import { PipelineAnalysisController } from './controllers/pipeline-analysis.controller';
import { JobAnalysisController } from './controllers/job-analysis.controller';
import { EncryptionService } from '../common/services/encryption.service';
import { GithubClient } from '../clients/github.client';
import { GitlabClient } from '../clients/gitlab.client';
import { GitHubMrManager } from '../clients/mr-manager/github-mr.manager';
import { GitLabMrManager } from '../clients/mr-manager/gitlab-mr.manager';
import { GitHubPipelineManager } from '../clients/pipeline-manager/github-pipeline.manager';
import { GitLabPipelineManager } from '../clients/pipeline-manager/gitlab-pipeline.manager';
import { GitHubJobManager } from '../clients/job-manager/github-job.manager';
import { GitLabJobManager } from '../clients/job-manager/gitlab-job.manager';
import { GitHubProvider } from './providers/github.provider';
import { GitLabProvider } from './providers/gitlab.provider';
import { ReviewAgentService } from '../agents/review/agent.service';
import { DiagramAgentService } from '../agents/diagram/agent.service';
import { CommentOrchestratorService } from '../agents/review/helpers/comment-orchestrator.service';
import { PipelineAnalysisAgent } from '../agents/pipelines/pipeline-analysis.agent';
import { JobAnalysisAgent } from '../agents/jobs/job-analysis.agent';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GitRepository,
      GitCredential,
      PullRequest,
      ReviewComment,
      PullRequestDiagram,
      Release,
      Pipeline,
      Job,
      PipelineAnalysis,
      JobAnalysis,
      Project,
      JiraTicket,
    ]),
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
  ],
  controllers: [
    GitController,
    GitCredentialsController,
    PullRequestController,
    ReviewController,
    DiagramController,
    PipelineController,
    PipelineAnalysisController,
    JobAnalysisController,
  ],
  providers: [
    GitService,
    GitCredentialsService,
    PullRequestService,
    ReleaseService,
    ReviewService,
    DiagramService,
    PipelineService,
    PipelineAnalysisService,
    JobAnalysisService,
    PipelineAnalysisAgent,
    JobAnalysisAgent,
    EncryptionService,
    GithubClient,
    GitlabClient,
    GitHubMrManager,
    GitLabMrManager,
    GitHubPipelineManager,
    GitLabPipelineManager,
    GitHubJobManager,
    GitLabJobManager,
    GitHubProvider,
    GitLabProvider,
    ReviewAgentService,
    DiagramAgentService,
    CommentOrchestratorService,
  ],
  exports: [
    GitService,
    GitCredentialsService,
    PullRequestService,
    ReleaseService,
    ReviewService,
    DiagramService,
    PipelineService,
    PipelineAnalysisService,
    JobAnalysisService,
  ],
})
export class GitModule {}