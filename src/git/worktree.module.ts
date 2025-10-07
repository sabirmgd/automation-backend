import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Worktree } from './entities/worktree.entity';
import { GitRepository } from './entities/git-repository.entity';
import { JiraTicket } from '../modules/jira/entities/jira-ticket.entity';
import { Project } from '../projects/project.entity';
import { WorktreeService } from './services/worktree.service';
import { WorktreeController } from './controllers/worktree.controller';
import { CommandClient } from '../clients/command/command.client';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Worktree,
      GitRepository,
      JiraTicket,
      Project,
    ]),
  ],
  controllers: [WorktreeController],
  providers: [WorktreeService, CommandClient],
  exports: [WorktreeService],
})
export class WorktreeModule {}
