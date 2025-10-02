import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { PullRequest } from './pull-request.entity';

export enum DiagramType {
  FLOWCHART = 'flowchart',
  SEQUENCE = 'sequence',
  CLASS = 'class',
  STATE = 'state',
  GANTT = 'gantt',
  ER = 'er',
  JOURNEY = 'journey',
  GITGRAPH = 'gitgraph',
  ARCHITECTURE = 'architecture',
  DATAFLOW = 'dataflow',
}

export enum DiagramValidationStatus {
  VALID = 'valid',
  INVALID = 'invalid',
  PENDING = 'pending',
}

@Entity('pull_request_diagrams')
@Index(['pullRequestId', 'isLatest'])
@Index(['pullRequestId', 'diagramType'])
@Index(['validationStatus', 'createdAt'])
export class PullRequestDiagram {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  pullRequestId: string;

  @ManyToOne(() => PullRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pullRequestId' })
  pullRequest: PullRequest;

  @Column({
    type: 'enum',
    enum: DiagramType,
    default: DiagramType.ARCHITECTURE,
  })
  diagramType: DiagramType;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text' })
  mermaidCode: string;

  @Column({ type: 'text', nullable: true })
  summary?: string;

  @Column({ type: 'simple-array', nullable: true })
  focusAreas?: string[];

  @Column({ type: 'simple-array', nullable: true })
  impactedComponents?: string[];

  @Column({ type: 'varchar', length: 20, nullable: true })
  complexity?: 'low' | 'medium' | 'high';

  @Column({ type: 'text', nullable: true })
  suggestedReviewFlow?: string;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @Column({ type: 'boolean', default: true })
  isLatest: boolean;

  @Column({
    type: 'enum',
    enum: DiagramValidationStatus,
    default: DiagramValidationStatus.PENDING,
  })
  validationStatus: DiagramValidationStatus;

  @Column({ type: 'text', nullable: true })
  validationError?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  renderedUrl?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    filesAnalyzed?: string[];
    generationTime?: number;
    tokenCount?: number;
    modelUsed?: string;
    supplementaryDiagrams?: Array<{
      diagramType: string;
      title: string;
      description: string;
      mermaidCode: string;
    }>;
    [key: string]: any;
  };

  @Column({ type: 'varchar', length: 100, nullable: true })
  generationSessionId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}