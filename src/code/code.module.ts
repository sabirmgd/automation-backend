import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodeService } from './code.service';
import { CodeController } from './code.controller';
import { CommandModule } from '../clients/command/command.module';
import { JiraModule } from '../modules/jira/jira.module';
import { ProjectsModule } from '../projects/projects.module';
import { PromptsModule } from '../prompts/prompts.module';
import { HiddenComment } from '../modules/jira/entities/hidden-comment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([HiddenComment]),
    CommandModule,
    JiraModule,
    ProjectsModule,
    PromptsModule,
  ],
  controllers: [CodeController],
  providers: [CodeService],
  exports: [CodeService],
})
export class CodeModule {}