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
import { JiraTicket } from '../../modules/jira/entities/jira-ticket.entity';
import { Project } from '../../projects/project.entity';
import { Worktree } from '../../git/entities/worktree.entity';

export enum WorkflowStatus {
  NOT_STARTED = 'not_started',
  ANALYSIS = 'analysis',
  BRANCH_GENERATED = 'branch_generated',
  WORKTREE_CREATED = 'worktree_created',
  DEVELOPMENT = 'development',
  DEVELOPMENT_COMPLETE = 'development_complete',
  VERIFYING = 'verifying',
  VERIFICATION_COMPLETE = 'verification_complete',
  VERIFICATION_RESOLUTION_IN_PROGRESS = 'verification_resolution_in_progress',
  VERIFICATION_RESOLUTION_COMPLETE = 'verification_resolution_complete',
  TESTING_IN_PROGRESS = 'testing_in_progress',
  TESTING_COMPLETE = 'testing_complete',
  TESTING_PARTIAL = 'testing_partial',
  TESTING_FAILED = 'testing_failed',
  TESTING_NEEDS_FIX = 'testing_needs_fix',
  READY_FOR_PR = 'ready_for_pr',
  PR_CREATED = 'pr_created',
  IN_REVIEW = 'in_review',
  COMPLETED = 'completed',
  ERROR = 'error',
}

export enum AnalysisStatus {
  NONE = 'none',
  PENDING = 'pending',
  COMPLETE = 'complete',
}

@Entity('ticket_workflows')
@Index(['ticketId'], { unique: true })
@Index(['projectId'])
@Index(['status'])
export class TicketWorkflow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ticketId: string;

  @ManyToOne(() => JiraTicket, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticketId' })
  ticket: JiraTicket;

  @Column({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  // Analysis phase
  @Column({ type: 'varchar', nullable: true })
  analysisSessionId: string;

  @Column({
    type: 'enum',
    enum: AnalysisStatus,
    default: AnalysisStatus.NONE,
  })
  analysisStatus: AnalysisStatus;

  // Branch name phase
  @Column({ type: 'varchar', nullable: true })
  generatedBranchName: string;

  @Column({ type: 'jsonb', nullable: true })
  branchNameMetadata: {
    type?: string;
    confidence?: string;
    reasoning?: string;
    alternatives?: string[];
    generatedAt?: Date;
  };

  // Worktree phase
  @Column({ type: 'uuid', nullable: true })
  worktreeId: string;

  @ManyToOne(() => Worktree, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'worktreeId' })
  worktree: Worktree;

  // Happy session phase
  @Column({ type: 'varchar', nullable: true })
  happySessionId: string;

  @Column({ nullable: true })
  happyProcessId: number;

  @Column({ type: 'jsonb', nullable: true })
  happySessionMetadata: {
    mode?: 'implementation' | 'context';
    startedAt?: Date;
    stoppedAt?: Date;
    status?: 'running' | 'stopped' | 'crashed' | 'context_sent';
    additionalInstructions?: string;
    initialResponse?: string;
  };

  // Verification Resolution phase
  @Column({ type: 'varchar', nullable: true })
  verificationResolutionSessionId: string;

  @Column({ type: 'jsonb', nullable: true })
  verificationResolutionMetadata: {
    mode?: 'context' | 'implementation';
    startedAt?: Date;
    completedAt?: Date;
    verificationId?: string;
    resolutionNotes?: string;
    status?: 'not_started' | 'context_sent' | 'in_progress' | 'completed';
    additionalInstructions?: string;
    initialResponse?: string;
  };

  // PR phase
  @Column({ type: 'uuid', nullable: true })
  pullRequestId: string;

  // Overall workflow status
  @Column({
    type: 'enum',
    enum: WorkflowStatus,
    default: WorkflowStatus.NOT_STARTED,
  })
  status: WorkflowStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
