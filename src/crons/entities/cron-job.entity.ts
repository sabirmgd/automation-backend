import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Project } from '../../projects/project.entity';
import { CronJobExecution } from './cron-job-execution.entity';

export enum CronJobStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  RUNNING = 'running',
  ERROR = 'error',
}

@Entity('cron_jobs')
export class CronJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 255 })
  cronExpression: string;

  @Column({
    type: 'enum',
    enum: CronJobStatus,
    default: CronJobStatus.INACTIVE,
  })
  status: CronJobStatus;

  @Column({ type: 'boolean', default: false })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastRun: Date;

  @Column({ type: 'timestamp', nullable: true })
  nextRun: Date;

  @Column({ type: 'int', default: 0 })
  executionCount: number;

  @Column({ type: 'int', default: 0 })
  failureCount: number;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'uuid', nullable: true })
  projectId: string;

  @ManyToOne(() => Project, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @OneToMany(() => CronJobExecution, (execution) => execution.cronJob)
  executions: CronJobExecution[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}