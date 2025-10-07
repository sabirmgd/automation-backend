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
import { GitRepository } from './git-repository.entity';
import { JiraTicket } from '../../modules/jira/entities/jira-ticket.entity';

export enum WorktreeStatus {
  ACTIVE = 'active',
  DELETED = 'deleted',
  STALE = 'stale',
}

export enum EnvHandling {
  COPY = 'copy',
  LINK = 'link',
  SKIP = 'skip',
}

@Entity('worktrees')
@Index(['repositoryId', 'status'])
@Index(['ticketId'])
@Index(['branchName'])
@Index(['status'])
export class Worktree {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  repositoryId: string | null;

  @ManyToOne(() => GitRepository, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'repositoryId' })
  repository: GitRepository | null;

  @Column({ type: 'uuid', nullable: true })
  ticketId: string;

  @ManyToOne(() => JiraTicket, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ticketId' })
  ticket: JiraTicket;

  @Column({ type: 'varchar', length: 255 })
  branchName: string;

  @Column({ type: 'varchar', length: 500 })
  worktreePath: string;

  @Column({ type: 'varchar', length: 255, default: 'main' })
  baseBranch: string;

  @Column({
    type: 'enum',
    enum: WorktreeStatus,
    default: WorktreeStatus.ACTIVE,
  })
  status: WorktreeStatus;

  @Column({
    type: 'enum',
    enum: EnvHandling,
    default: EnvHandling.LINK,
  })
  envHandling: EnvHandling;

  @Column({ type: 'boolean', default: false })
  nodeModulesShared: boolean;

  @Column({ type: 'boolean', default: false })
  isNewBranch: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    happySessionId?: string;
    pullRequestId?: string;
    createdBy?: string;
    deletedBy?: string;
    commitHash?: string;
    lastAccessedAt?: Date;
    diskUsage?: number; // in bytes
    [key: string]: any;
  };

  @Column({ type: 'timestamp', nullable: true })
  deletedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
