import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronsService } from '../crons.service';
import { CronJob, CronJobStatus } from '../entities/cron-job.entity';
import { CronJobType, JiraSyncMode } from '../enums/cron-job-type.enum';
import { JiraSyncService } from '../../modules/jira/services/jira-sync.service';
import { JiraBoardService } from '../../modules/jira/services/jira-board.service';
import { JiraAccountService } from '../../modules/jira/services/jira-account.service';

@Injectable()
export class CronScheduler implements OnModuleInit {
  private readonly logger = new Logger(CronScheduler.name);

  constructor(
    private schedulerRegistry: SchedulerRegistry,
    private cronsService: CronsService,
    @Inject(forwardRef(() => JiraSyncService))
    private jiraSyncService: JiraSyncService,
    @Inject(forwardRef(() => JiraBoardService))
    private jiraBoardService: JiraBoardService,
    @Inject(forwardRef(() => JiraAccountService))
    private jiraAccountService: JiraAccountService,
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
      let output: string;
      let executionResult: { success: boolean; message: string; details?: any };

      // Execute based on job type
      switch (cronJob.jobType) {
        case CronJobType.JIRA_SYNC:
          executionResult = await this.executeJiraSyncJob(cronJob);
          output = `[${timestamp}] ${executionResult.message}`;
          break;

        case CronJobType.GENERIC:
        default:
          output = `[${timestamp}] Cron job "${cronJob.name}" executed successfully`;
          executionResult = { success: true, message: output };

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
          break;
      }

      console.log(output);
      await this.cronsService.completeExecution(
        execution.id,
        executionResult.success,
        output,
        executionResult.success ? null : executionResult.message,
      );
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

  private async executeJiraSyncJob(cronJob: CronJob): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    const metadata = cronJob.metadata as {
      syncMode: JiraSyncMode;
      boardId?: string;
      accountId?: string;
      jql?: string;
      options?: {
        clearExisting?: boolean;
        syncComments?: boolean;
        syncAttachments?: boolean;
      };
    };

    if (!metadata?.syncMode) {
      return {
        success: false,
        message: 'Jira sync job missing syncMode configuration',
      };
    }

    try {
      let syncResults: any[] = [];

      switch (metadata.syncMode) {
        case JiraSyncMode.SINGLE_BOARD:
          if (!metadata.boardId) {
            return {
              success: false,
              message: 'Board ID required for single board sync mode',
            };
          }

          this.logger.log(`Syncing Jira board: ${metadata.boardId}`);
          await this.jiraSyncService.syncBoardTickets(metadata.boardId);
          syncResults.push({ boardId: metadata.boardId, status: 'synced' });
          break;

        case JiraSyncMode.ALL_BOARDS:
          this.logger.log('Syncing all Jira boards');
          const boards = await this.jiraBoardService.findAll();

          for (const board of boards) {
            try {
              await this.jiraSyncService.syncBoardTickets(board.id);
              syncResults.push({ boardId: board.id, boardName: board.name, status: 'synced' });
            } catch (error) {
              this.logger.error(`Failed to sync board ${board.id}:`, error);
              syncResults.push({ boardId: board.id, boardName: board.name, status: 'failed', error: error.message });
            }
          }
          break;

        case JiraSyncMode.BY_ACCOUNT:
          if (!metadata.accountId) {
            return {
              success: false,
              message: 'Account ID required for account sync mode',
            };
          }

          this.logger.log(`Syncing Jira account: ${metadata.accountId}`);
          await this.jiraSyncService.syncAccount(metadata.accountId);
          syncResults.push({ accountId: metadata.accountId, status: 'synced' });
          break;

        case JiraSyncMode.CUSTOM_JQL:
          if (!metadata.jql || !metadata.accountId) {
            return {
              success: false,
              message: 'JQL query and account ID required for custom JQL sync mode',
            };
          }

          this.logger.log(`Syncing with custom JQL: ${metadata.jql}`);
          // This would need to be implemented in JiraSyncService
          // await this.jiraSyncService.syncByJql(metadata.accountId, metadata.jql, metadata.options);
          return {
            success: false,
            message: 'Custom JQL sync not yet implemented',
          };

        default:
          return {
            success: false,
            message: `Unknown sync mode: ${metadata.syncMode}`,
          };
      }

      const successCount = syncResults.filter(r => r.status === 'synced').length;
      const failureCount = syncResults.filter(r => r.status === 'failed').length;

      return {
        success: failureCount === 0,
        message: `Jira sync completed: ${successCount} successful, ${failureCount} failed`,
        details: syncResults,
      };
    } catch (error) {
      this.logger.error(`Jira sync job failed:`, error);
      return {
        success: false,
        message: `Jira sync failed: ${error.message}`,
      };
    }
  }
}