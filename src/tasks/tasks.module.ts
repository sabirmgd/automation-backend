import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TaskIntegrationService } from './task-integration.service';
import { Task } from './entities/task.entity';
import { TaskLink } from './entities/task-link.entity';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task, TaskLink]),
    ProjectsModule,
  ],
  controllers: [TasksController],
  providers: [TasksService, TaskIntegrationService],
  exports: [TasksService, TaskIntegrationService],
})
export class TasksModule {}