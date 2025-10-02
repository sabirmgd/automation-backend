import { Entity, Column, PrimaryColumn, OneToMany, OneToOne, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Job } from './job.entity';
import { PipelineAnalysis } from './pipeline-analysis.entity';
import { PullRequest } from './pull-request.entity';

export enum PipelineStatus {
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

@Entity('pipelines')
export class Pipeline {
  @PrimaryColumn()
  id: string;

  @Column()
  iid: number;

  @Column()
  projectId: string;

  @Column({ nullable: true })
  repositoryId?: string;

  @Column({ nullable: true })
  pullRequestId?: string;

  @ManyToOne(() => PullRequest, pullRequest => pullRequest.pipelines, { nullable: true })
  @JoinColumn({ name: 'pullRequestId' })
  pullRequest?: PullRequest;

  @Column()
  sha: string;

  @Column()
  ref: string;

  @Column({
    type: 'enum',
    enum: PipelineStatus
  })
  status: PipelineStatus;

  @Column()
  source: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  startedAt?: Date;

  @Column({ nullable: true })
  finishedAt?: Date;

  @Column({ nullable: true })
  duration?: number;

  @Column({ nullable: true })
  queuedDuration?: number;

  @Column({ type: 'float', nullable: true })
  coverage?: number;

  @Column()
  webUrl: string;

  @Column('jsonb', { nullable: true })
  detailedStatus?: {
    icon: string;
    text: string;
    label: string;
    group: string;
    tooltip: string;
    hasDetails: boolean;
    detailsPath: string;
    favicon: string;
  };

  @Column({ nullable: true })
  beforeSha?: string;

  @Column()
  tag: boolean;

  @Column({ nullable: true })
  yamlErrors?: string;

  @Column('jsonb', { nullable: true })
  user?: {
    id: string;
    name: string;
    username: string;
    state: string;
    avatarUrl?: string;
    webUrl: string;
  };

  @Column('jsonb', { nullable: true })
  commit?: {
    id: string;
    shortId: string;
    title: string;
    message: string;
    authorName: string;
    authorEmail: string;
    authoredDate: Date;
    committerName: string;
    committerEmail: string;
    committedDate: Date;
    webUrl: string;
  };

  @OneToMany(() => Job, job => job.pipeline)
  jobs?: Job[];

  @Column('jsonb', { nullable: true })
  stages?: Array<{
    name: string;
    status: string;
    jobs: Job[];
  }>;

  @Column('jsonb', { nullable: true })
  variables?: Array<{
    key: string;
    value: string;
    variableType: string;
  }>;

  @OneToOne(() => PipelineAnalysis, analysis => analysis.pipeline)
  analysis?: PipelineAnalysis;
}