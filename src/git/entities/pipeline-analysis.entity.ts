import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Pipeline } from './pipeline.entity';

export enum PipelineFailureType {
  YAML_SYNTAX_ERROR = 'yaml_syntax_error',
  JOB_DEPENDENCY_ERROR = 'job_dependency_error',
  MISSING_JOB_DEFINITION = 'missing_job_definition',
  INVALID_CONFIGURATION = 'invalid_configuration',
  RESOURCE_CONSTRAINT = 'resource_constraint',
  PERMISSION_ISSUE = 'permission_issue',
  NETWORK_ISSUE = 'network_issue',
  MULTIPLE_JOB_FAILURES = 'multiple_job_failures',
  PIPELINE_TIMEOUT = 'pipeline_timeout',
  EXTERNAL_SERVICE = 'external_service',
  UNKNOWN = 'unknown'
}

export enum ConfidenceLevel {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

@Entity('pipeline_analyses')
export class PipelineAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  pipelineId: string;

  @ManyToOne(() => Pipeline, { nullable: true })
  @JoinColumn({ name: 'pipelineId' })
  pipeline?: Pipeline;

  @Column({ nullable: true })
  pipelineName?: string;

  @Column()
  projectId: string;

  @Column({ nullable: true })
  mergeRequestIid?: number;

  @Column({ nullable: true })
  ref?: string;

  @Column({ nullable: true })
  triggeredBy?: string;

  @Column()
  pipelineStatus: string;

  @Column()
  failedJobsCount: number;

  @Column()
  totalJobsCount: number;

  @Column({
    type: 'enum',
    enum: PipelineFailureType,
    default: PipelineFailureType.UNKNOWN
  })
  failureType: PipelineFailureType;

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

  @Column('simple-array', { nullable: true })
  failedJobNames?: string[];

  @Column('simple-array', { nullable: true })
  failedJobStages?: string[];

  @Column()
  analyzedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}