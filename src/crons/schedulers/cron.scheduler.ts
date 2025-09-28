import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronsService } from '../crons.service';
import { CronJob, CronJobStatus } from '../entities/cron-job.entity';

@Injectable()
export class CronScheduler implements OnModuleInit {
  private readonly logger = new Logger(CronScheduler.name);

  constructor(
    private schedulerRegistry: SchedulerRegistry,
    private cronsService: CronsService,
  ) {
    // Set the reference to this scheduler in the service
    this.cronsService.setCronScheduler(this);
  }

  async onModuleInit() {
    await this.loadActiveCronJobs();
  }

  private async loadActiveCronJobs() {
    try {
      const activeJobs = await this.cronsService.findActiveJobs();
      for (const job of activeJobs) {
        await this.registerCronJob(job);
      }
      this.logger.log(`Loaded ${activeJobs.length} active cron jobs`);
    } catch (error) {
      this.logger.error('Failed to load active cron jobs', error);
    }
  }

  async registerCronJob(cronJob: CronJob) {
    const jobName = `cron_${cronJob.id}`;

    try {
      if (this.schedulerRegistry.doesExist('cron', jobName)) {
        this.schedulerRegistry.deleteCronJob(jobName);
      }

      // Use dynamic import to get the correct CronJob class
      const { CronJob: NodeCronJob } = await import('cron');

      const job = new NodeCronJob(cronJob.cronExpression, async () => {
        await this.executeCronJob(cronJob.id);
      });

      this.schedulerRegistry.addCronJob(jobName, job as any);

      if (cronJob.isActive) {
        job.start();
        this.logger.log(`Registered and started cron job: ${cronJob.name}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to register cron job ${cronJob.name}`,
        error,
      );
    }
  }

  async unregisterCronJob(cronJobId: string) {
    const jobName = `cron_${cronJobId}`;

    try {
      if (this.schedulerRegistry.doesExist('cron', jobName)) {
        this.schedulerRegistry.deleteCronJob(jobName);
        this.logger.log(`Unregistered cron job: ${jobName}`);
      }
    } catch (error) {
      this.logger.error(`Failed to unregister cron job ${jobName}`, error);
    }
  }

  async updateCronJob(cronJob: CronJob) {
    await this.unregisterCronJob(cronJob.id);
    if (cronJob.isActive) {
      await this.registerCronJob(cronJob);
    }
  }

  async startCronJob(cronJobId: string) {
    const jobName = `cron_${cronJobId}`;

    try {
      const job = this.schedulerRegistry.getCronJob(jobName);
      job.start();
      this.logger.log(`Started cron job: ${jobName}`);
    } catch (error) {
      this.logger.error(`Failed to start cron job ${jobName}`, error);
    }
  }

  async stopCronJob(cronJobId: string) {
    const jobName = `cron_${cronJobId}`;

    try {
      const job = this.schedulerRegistry.getCronJob(jobName);
      job.stop();
      this.logger.log(`Stopped cron job: ${jobName}`);
    } catch (error) {
      this.logger.error(`Failed to stop cron job ${jobName}`, error);
    }
  }

  private async executeCronJob(cronJobId: string) {
    // Load fresh state from DB to avoid stale status
    const cronJob = await this.cronsService.findOne(cronJobId);
    this.logger.log(`Executing cron job: ${cronJob.name}`);

    // Prevent overlapping runs
    if (cronJob.status === CronJobStatus.RUNNING) {
      this.logger.warn(`Skip execution; job already running: ${cronJob.name}`);
      return;
    }

    try {
      await this.cronsService.setJobStatus(cronJob.id, CronJobStatus.RUNNING);
    } catch (e) {
      this.logger.error(`Failed to set RUNNING status for ${cronJob.name}`, e);
    }

    const execution = await this.cronsService.createExecution(cronJob.id);

    try {
      const timestamp = new Date().toISOString();
      const output = `[${timestamp}] Cron job "${cronJob.name}" executed successfully`;
      console.log(output);

      if (cronJob.metadata?.action) {
        console.log(
          `[${timestamp}] Action: ${cronJob.metadata.action}`,
        );
      }

      if (cronJob.projectId) {
        console.log(
          `[${timestamp}] Associated with project: ${cronJob.projectId}`,
        );
      }

      await this.cronsService.completeExecution(execution.id, true, output);
    } catch (error) {
      this.logger.error(
        `Failed to execute cron job ${cronJob.name}`,
        error,
      );
      await this.cronsService.completeExecution(execution.id, false, null, error.message);
    } finally {
      try {
        const fresh = await this.cronsService.findOne(cronJob.id);
        const restored = fresh.isActive ? CronJobStatus.ACTIVE : CronJobStatus.INACTIVE;
        await this.cronsService.setJobStatus(cronJob.id, restored);
      } catch (e) {
        this.logger.error(`Failed to restore status for ${cronJob.name}`, e);
      }
    }
  }

  async triggerManualExecution(cronJobId: string) {
    try {
      await this.executeCronJob(cronJobId);
    } catch (error) {
      this.logger.error(
        `Failed to manually trigger cron job ${cronJobId}`,
        error,
      );
      throw error;
    }
  }
}