import { Entity, Column, PrimaryGeneratedColumn, OneToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Job } from './job.entity';

export enum JobFailureType {
  SYNTAX_ERROR = 'syntax_error',
  CONFIGURATION_ERROR = 'configuration_error',
  DEPENDENCY_ISSUE = 'dependency_issue',
  RESOURCE_CONSTRAINT = 'resource_constraint',
  PERMISSION_ISSUE = 'permission_issue',
  NETWORK_ISSUE = 'network_issue',
  TEST_FAILURE = 'test_failure',
  BUILD_ERROR = 'build_error',
  ENVIRONMENT_ISSUE = 'environment_issue',
  EXTERNAL_SERVICE = 'external_service',
  UNKNOWN = 'unknown'
}

export enum ConfidenceLevel {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

@Entity('job_analyses')
export class JobAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  jobId: string;

  @OneToOne(() => Job, job => job.analysis)
  @JoinColumn({ name: 'jobId' })
  job?: Job;

  @Column()
  jobName: string;

  @Column()
  stage: string;

  @Column()
  projectId: string;

  @Column()
  pipelineId: string;

  @Column({ nullable: true })
  mergeRequestIid?: number;

  @Column({ nullable: true })
  ref?: string;

  @Column({ nullable: true })
  triggeredBy?: string;

  @Column({
    type: 'enum',
    enum: JobFailureType,
    default: JobFailureType.UNKNOWN
  })
  failureType: JobFailureType;

  @Column('text')
  rootCause: string;

  @Column()
  affectedComponent: string;

  @Column('simple-array')
  errorDetails: string[];

  @Column('simple-array')
  suggestedFixSteps: string[];

  @Column('simple-array', { nullable: true })
  suggestedFixCommands?: string[];

  @Column('simple-array', { nullable: true })
  preventionTips?: string[];

  @Column({
    type: 'enum',
    enum: ConfidenceLevel,
    default: ConfidenceLevel.LOW
  })
  confidence: ConfidenceLevel;

  @Column('text', { nullable: true })
  additionalContext?: string;

  @Column('simple-array', { nullable: true })
  relatedFiles?: string[];

  @Column({ nullable: true })
  estimatedFixTime?: string;

  @Column()
  analyzedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}