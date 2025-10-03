import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromptsService } from './prompts.service';
import { PromptsController, ProjectPromptsController } from './prompts.controller';
import { Prompt } from './prompt.entity';
import { Project } from '../projects/project.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Prompt, Project])],
  controllers: [PromptsController, ProjectPromptsController],
  providers: [PromptsService],
  exports: [PromptsService],
})
export class PromptsModule {}