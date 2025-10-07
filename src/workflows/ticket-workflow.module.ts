import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketWorkflow } from './entities/ticket-workflow.entity';
import { TicketWorkflowService } from './ticket-workflow.service';
import { TicketWorkflowController } from './ticket-workflow.controller';
import { CodeModule } from '../code/code.module';
import { JiraModule } from '../modules/jira/jira.module';
import { WorktreeModule } from '../git/worktree.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TicketWorkflow]),
    CodeModule,
    JiraModule,
    WorktreeModule,
    ProjectsModule,
  ],
  controllers: [TicketWorkflowController],
  providers: [TicketWorkflowService],
  exports: [TicketWorkflowService],
})
export class TicketWorkflowModule {}
