import { Entity, Column, PrimaryColumn, ManyToOne, OneToMany, OneToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Pipeline } from './pipeline.entity';
import { JobAnalysis } from './job-analysis.entity';

export enum JobStatus {
  CREATED = 'created',
  WAITING_FOR_RESOURCE = 'waiting_for_resource',
  PREPARING = 'preparing',
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELED = 'canceled',
  SKIPPED = 'skipped',
  MANUAL = 'manual',
  SCHEDULED = 'scheduled'
}

@Entity('jobs')
export class Job {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column({
    type: 'enum',
    enum: JobStatus
  })
  status: JobStatus;

  @Column()
  stage: string;

  @Column({ nullable: true })
  startedAt?: Date;

  @Column({ nullable: true })
  finishedAt?: Date;

  @Column({ nullable: true })
  duration?: number;

  @Column({ nullable: true })
  queueDuration?: number;

  @Column({ type: 'float', nullable: true })
  coverage?: number;

  @Column({ default: false })
  allowFailure: boolean;

  @Column({ nullable: true })
  failureReason?: string;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ default: 0 })
  maxRetries: number;

  @Column({ nullable: true })
  ref?: string;

  @Column({ nullable: true })
  tag?: boolean;

  @Column({ nullable: true })
  webUrl?: string;

  @Column('jsonb', { nullable: true })
  artifacts?: any[];

  @Column('jsonb', { nullable: true })
  runner?: {
    id: number;
    description: string;
    active: boolean;
    tags: string[];
  };

  @ManyToOne(() => Pipeline, pipeline => pipeline.jobs, { nullable: true })
  @JoinColumn({ name: 'pipelineId' })
  pipeline?: Pipeline;

  @Column('jsonb', { nullable: true })
  user?: {
    id: string;
    name: string;
    username: string;
    avatarUrl?: string;
  };

  @OneToMany(() => Job, job => job.upstream)
  downstream?: Job[];

  @ManyToOne(() => Job, job => job.downstream, { nullable: true })
  upstream?: Job;

  @OneToOne(() => JobAnalysis, analysis => analysis.job)
  analysis?: JobAnalysis;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}