import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  OneToMany,
  JoinColumn,
  JoinTable,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { GitRepository } from './git-repository.entity';
import { JiraTicket } from '../../modules/jira/entities/jira-ticket.entity';
import { ReviewComment } from './review-comment.entity';
import { Pipeline } from './pipeline.entity';
import { Worktree } from './worktree.entity';

export enum PullRequestStatus {
  OPEN = 'open',
  CLOSED = 'closed',
  MERGED = 'merged',
  DRAFT = 'draft',
}

export enum PullRequestState {
  PENDING = 'pending',
  APPROVED = 'approved',
  CHANGES_REQUESTED = 'changes_requested',
  DISMISSED = 'dismissed',
}

@Entity('pull_requests')
@Index(['repositoryId', 'remoteId'], { unique: true })
@Index(['status', 'createdAt'])
export class PullRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  remoteId: string;

  @Column({ type: 'integer' })
  number: number;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: PullRequestStatus,
    default: PullRequestStatus.OPEN,
  })
  status: PullRequestStatus;

  @Column({
    type: 'enum',
    enum: PullRequestState,
    nullable: true,
  })
  state: PullRequestState;

  @Column({ type: 'varchar', length: 255 })
  sourceBranch: string;

  @Column({ type: 'varchar', length: 255 })
  targetBranch: string;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  authorUsername: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  authorEmail: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  authorAvatarUrl: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  mergedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  mergedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  closedAt: Date;

  @Column({ type: 'integer', default: 0 })
  commitsCount: number;

  @Column({ type: 'integer', default: 0 })
  additions: number;

  @Column({ type: 'integer', default: 0 })
  deletions: number;

  @Column({ type: 'integer', default: 0 })
  changedFiles: number;

  @Column({ type: 'integer', default: 0 })
  commentsCount: number;

  @Column({ type: 'integer', default: 0 })
  reviewCommentsCount: number;

  @Column({ type: 'simple-array', nullable: true })
  reviewers: string[];

  @Column({ type: 'simple-array', nullable: true })
  assignees: string[];

  @Column({ type: 'simple-array', nullable: true })
  labels: string[];

  @Column({ type: 'boolean', default: false })
  isDraft: boolean;

  @Column({ type: 'boolean', default: false })
  isConflicted: boolean;

  @Column({ type: 'boolean', default: true })
  isMergeable: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  headSha: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  baseSha: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  mergeSha: string;

  @ManyToOne(() => GitRepository, { onDelete: 'CASCADE' })
  @JoinColumn()
  repository: GitRepository;

  @Column({ type: 'uuid' })
  repositoryId: string;

  @Column({ type: 'uuid', nullable: true })
  worktreeId: string;

  @ManyToOne(() => Worktree, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'worktreeId' })
  worktree: Worktree;

  @ManyToMany(() => JiraTicket, { cascade: false })
  @JoinTable({
    name: 'pull_request_tickets',
    joinColumn: { name: 'pullRequestId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'ticketId', referencedColumnName: 'id' },
  })
  linkedTickets: JiraTicket[];

  @OneToMany(() => ReviewComment, (comment) => comment.pullRequest)
  reviewComments: ReviewComment[];

  @OneToMany(() => Pipeline, (pipeline) => pipeline.pullRequest)
  pipelines: Pipeline[];

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    milestone?: string;
    buildStatus?: string;
    pipelineId?: string;
    checksStatus?: Record<string, any>;
    protectedBranch?: boolean;
    autoMerge?: boolean;
    squashMerge?: boolean;
    rebaseRequired?: boolean;
    [key: string]: any;
  };

  @Column({ type: 'timestamp', nullable: true })
  remoteCreatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  remoteUpdatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}