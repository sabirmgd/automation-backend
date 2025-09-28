import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CronJob, CronJobStatus } from './entities/cron-job.entity';
import {
  CronJobExecution,
  ExecutionStatus,
} from './entities/cron-job-execution.entity';
import { CreateCronDto } from './dto/create-cron.dto';
import { UpdateCronDto } from './dto/update-cron.dto';
import { CronExpressionParser } from 'cron-parser';
import { CronScheduler } from './schedulers/cron.scheduler';

@Injectable()
export class CronsService {
  private readonly logger = new Logger(CronsService.name);
  private cronScheduler: CronScheduler;

  constructor(
    @InjectRepository(CronJob)
    private cronJobRepository: Repository<CronJob>,
    @InjectRepository(CronJobExecution)
    private executionRepository: Repository<CronJobExecution>,
  ) {}

  setCronScheduler(cronScheduler: CronScheduler) {
    this.cronScheduler = cronScheduler;
  }

  async create(createCronDto: CreateCronDto): Promise<CronJob> {
    try {
      CronExpressionParser.parse(createCronDto.cronExpression);
    } catch (error) {
      throw new BadRequestException('Invalid cron expression');
    }

    const cronJob = this.cronJobRepository.create({
      ...createCronDto,
      status: createCronDto.isActive
        ? CronJobStatus.ACTIVE
        : CronJobStatus.INACTIVE,
      nextRun: this.calculateNextRun(createCronDto.cronExpression),
    });

    const savedJob = await this.cronJobRepository.save(cronJob);

    // Register with scheduler if active
    if (savedJob.isActive && this.cronScheduler) {
      await this.cronScheduler.registerCronJob(savedJob);
    }

    return savedJob;
  }

  async findAll(): Promise<CronJob[]> {
    return await this.cronJobRepository.find({
      relations: ['project'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<CronJob> {
    const cronJob = await this.cronJobRepository.findOne({
      where: { id },
      relations: ['project', 'executions'],
    });

    if (!cronJob) {
      throw new NotFoundException(`Cron job with ID "${id}" not found`);
    }

    return cronJob;
  }

  async update(id: string, updateCronDto: UpdateCronDto): Promise<CronJob> {
    const cronJob = await this.findOne(id);

    if (updateCronDto.cronExpression) {
      try {
        CronExpressionParser.parse(updateCronDto.cronExpression);
        cronJob.nextRun = this.calculateNextRun(updateCronDto.cronExpression);
      } catch (error) {
        throw new BadRequestException('Invalid cron expression');
      }
    }

    Object.assign(cronJob, updateCronDto);

    if (updateCronDto.isActive !== undefined) {
      cronJob.status = updateCronDto.isActive
        ? CronJobStatus.ACTIVE
        : CronJobStatus.INACTIVE;
    }

    const updatedJob = await this.cronJobRepository.save(cronJob);

    // Update the scheduler
    if (this.cronScheduler) {
      await this.cronScheduler.updateCronJob(updatedJob);
    }

    return updatedJob;
  }

  async setJobStatus(id: string, status: CronJobStatus): Promise<void> {
    const cronJob = await this.findOne(id);
    cronJob.status = status;
    await this.cronJobRepository.save(cronJob);
  }

  async remove(id: string): Promise<void> {
    const cronJob = await this.findOne(id);

    // Unregister from scheduler
    if (this.cronScheduler) {
      await this.cronScheduler.unregisterCronJob(id);
    }

    await this.cronJobRepository.remove(cronJob);
  }

  async toggle(id: string): Promise<CronJob> {
    const cronJob = await this.findOne(id);
    cronJob.isActive = !cronJob.isActive;
    cronJob.status = cronJob.isActive
      ? CronJobStatus.ACTIVE
      : CronJobStatus.INACTIVE;

    if (cronJob.isActive) {
      cronJob.nextRun = this.calculateNextRun(cronJob.cronExpression);
    }

    const updatedJob = await this.cronJobRepository.save(cronJob);

    // Update the scheduler
    if (this.cronScheduler) {
      await this.cronScheduler.updateCronJob(updatedJob);
    }

    return updatedJob;
  }

  async findActiveJobs(): Promise<CronJob[]> {
    return await this.cronJobRepository.find({
      where: { isActive: true },
      relations: ['project'],
    });
  }

  async createExecution(cronJobId: string): Promise<CronJobExecution> {
    const execution = this.executionRepository.create({
      cronJobId,
      status: ExecutionStatus.RUNNING,
      startedAt: new Date(),
    });

    return await this.executionRepository.save(execution);
  }

  async completeExecution(
    executionId: string,
    success: boolean,
    output?: string,
    error?: string,
  ): Promise<CronJobExecution> {
    const execution = await this.executionRepository.findOne({
      where: { id: executionId },
    });

    if (!execution) {
      throw new NotFoundException(
        `Execution with ID "${executionId}" not found`,
      );
    }

    const completedAt = new Date();
    execution.completedAt = completedAt;
    execution.duration =
      completedAt.getTime() - execution.startedAt.getTime();
    execution.status = success
      ? ExecutionStatus.SUCCESS
      : ExecutionStatus.FAILURE;
    execution.output = output;
    execution.error = error;

    const savedExecution = await this.executionRepository.save(execution);

    const cronJob = await this.findOne(execution.cronJobId);
    cronJob.lastRun = completedAt;
    cronJob.executionCount += 1;
    if (!success) {
      cronJob.failureCount += 1;
    }
    cronJob.nextRun = this.calculateNextRun(cronJob.cronExpression);
    await this.cronJobRepository.save(cronJob);

    return savedExecution;
  }

  async getExecutions(cronJobId: string): Promise<CronJobExecution[]> {
    return await this.executionRepository.find({
      where: { cronJobId },
      order: { startedAt: 'DESC' },
      take: 50,
    });
  }

  async manualRun(id: string): Promise<{ message: string }> {
    const cronJob = await this.findOne(id);

    if (cronJob.status === CronJobStatus.RUNNING) {
      throw new BadRequestException('Cron job is already running');
    }

    this.logger.log(`Manually triggering cron job: ${cronJob.name}`);

    // Trigger the job execution
    if (this.cronScheduler) {
      await this.cronScheduler.triggerManualExecution(id);
    }

    return {
      message: `Cron job "${cronJob.name}" has been triggered manually`,
    };
  }

  private calculateNextRun(cronExpression: string): Date {
    try {
      const interval = CronExpressionParser.parse(cronExpression);
      const next = interval.next() as any;
      return typeof next?.toDate === 'function' ? next.toDate() : (next as Date);
    } catch (error) {
      this.logger.error(`Failed to calculate next run time: ${error.message}`);
      return null;
    }
  }
}