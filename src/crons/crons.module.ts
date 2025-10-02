import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { CronsService } from './crons.service';
import { CronsController } from './crons.controller';
import { CronScheduler } from './schedulers/cron.scheduler';
import { CronJob } from './entities/cron-job.entity';
import { CronJobExecution } from './entities/cron-job-execution.entity';
import { ProjectsModule } from '../projects/projects.module';
import { JiraModule } from '../modules/jira/jira.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CronJob, CronJobExecution]),
    ScheduleModule.forRoot(),
    ProjectsModule,
    forwardRef(() => JiraModule),
  ],
  controllers: [CronsController],
  providers: [CronsService, CronScheduler],
  exports: [CronsService],
})
export class CronsModule {}