import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodeService } from './code.service';
import { BranchNameService } from './branch-name.service';
import { HappyContextBuilder } from './happy-context.builder';
import { CodeController } from './code.controller';
import { CommandModule } from '../clients/command/command.module';
import { JiraModule } from '../modules/jira/jira.module';
import { ProjectsModule } from '../projects/projects.module';
import { PromptsModule } from '../prompts/prompts.module';
import { GitAgentsModule } from '../agents/git-agents/git-agents.module';
import { HiddenComment } from '../modules/jira/entities/hidden-comment.entity';
import { JiraTicket } from '../modules/jira/entities/jira-ticket.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([HiddenComment, JiraTicket]),
    CommandModule,
    JiraModule,
    ProjectsModule,
    PromptsModule,
    GitAgentsModule,
  ],
  controllers: [CodeController],
  providers: [CodeService, BranchNameService, HappyContextBuilder],
  exports: [CodeService, BranchNameService, HappyContextBuilder],
})
export class CodeModule {}