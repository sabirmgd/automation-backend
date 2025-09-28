import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CronJob } from './cron-job.entity';

export enum ExecutionStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
  RUNNING = 'running',
}

@Entity('cron_job_executions')
export class CronJobExecution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  cronJobId: string;

  @ManyToOne(() => CronJob, (cronJob) => cronJob.executions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'cronJobId' })
  cronJob: CronJob;

  @Column({
    type: 'enum',
    enum: ExecutionStatus,
    default: ExecutionStatus.RUNNING,
  })
  status: ExecutionStatus;

  @Column({ type: 'timestamp' })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ type: 'int', nullable: true })
  duration: number;

  @Column({ type: 'text', nullable: true })
  output: string;

  @Column({ type: 'text', nullable: true })
  error: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}