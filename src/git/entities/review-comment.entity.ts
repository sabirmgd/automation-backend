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

export enum CommentSeverity {
  CRITICAL = 'critical',
  MAJOR = 'major',
  MINOR = 'minor',
  INFO = 'info',
}

export enum SuggestionType {
  ERROR = 'ERROR',
  WARNING = 'WARNING',
  IMPROVEMENT = 'IMPROVEMENT',
  SECURITY = 'SECURITY',
  PERFORMANCE = 'PERFORMANCE',
  BEST_PRACTICE = 'BEST_PRACTICE',
}

export enum CommentMode {
  SINGLE_LINE = 'SINGLE_LINE',
  RANGE = 'RANGE',
}

@Entity('review_comments')
@Index(['pullRequestId', 'approved'])
@Index(['pullRequestId', 'posted'])
@Index(['severity', 'suggestionType'])
export class ReviewComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  pullRequestId: string;

  @ManyToOne(() => PullRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pullRequestId' })
  pullRequest: PullRequest;

  @Column({ type: 'varchar', length: 500 })
  file: string;

  @Column({ type: 'integer' })
  startLine: number;

  @Column({ type: 'integer', nullable: true })
  endLine?: number;

  @Column({ type: 'integer', nullable: true })
  oldStartLine?: number;

  @Column({ type: 'integer', nullable: true })
  oldEndLine?: number;

  @Column({
    type: 'enum',
    enum: CommentMode,
    default: CommentMode.SINGLE_LINE,
  })
  commentMode: CommentMode;

  @Column({
    type: 'enum',
    enum: CommentSeverity,
    default: CommentSeverity.MINOR,
  })
  severity: CommentSeverity;

  @Column({
    type: 'enum',
    enum: SuggestionType,
    default: SuggestionType.IMPROVEMENT,
  })
  suggestionType: SuggestionType;

  @Column({ type: 'varchar', length: 500 })
  action: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'text', nullable: true })
  patch?: string;

  @Column({ type: 'boolean', default: false })
  approved: boolean;

  @Column({ type: 'boolean', default: false })
  posted: boolean;

  @Column({ type: 'timestamp', nullable: true })
  postedAt?: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  gitCommentId?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  approvedBy?: string;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt?: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    baseSha?: string;
    headSha?: string;
    diffPosition?: any;
    postError?: string;
    retryCount?: number;
    [key: string]: any;
  };

  @Column({ type: 'varchar', length: 100, nullable: true })
  reviewSessionId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}