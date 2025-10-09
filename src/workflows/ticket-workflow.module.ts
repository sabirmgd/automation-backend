import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketWorkflow } from './entities/ticket-workflow.entity';
import { VerificationResult } from './entities/verification-result.entity';
import { IntegrationTestResult } from './entities/integration-test-result.entity';
import { TicketWorkflowService } from './ticket-workflow.service';
import { WorkVerificationService } from './work-verification.service';
import { VerificationResolutionService } from './verification-resolution.service';
import { IntegrationTestingService } from './integration-testing.service';
import { VerificationAgentService } from '../agents/verification/agent.service';
import { TestingAgentService } from '../agents/testing/agent.service';
import { TicketWorkflowController } from './ticket-workflow.controller';
import { CodeModule } from '../code/code.module';
import { JiraModule } from '../modules/jira/jira.module';
import { WorktreeModule } from '../git/worktree.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TicketWorkflow, VerificationResult, IntegrationTestResult]),
    CodeModule,
    JiraModule,
    WorktreeModule,
    ProjectsModule,
  ],
  controllers: [TicketWorkflowController],
  providers: [
    TicketWorkflowService,
    WorkVerificationService,
    VerificationResolutionService,
    IntegrationTestingService,
    VerificationAgentService,
    TestingAgentService,
  ],
  exports: [
    TicketWorkflowService,
    WorkVerificationService,
    VerificationResolutionService,
    IntegrationTestingService,
  ],
})
export class TicketWorkflowModule {}
