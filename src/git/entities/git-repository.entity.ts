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
import { Project } from '../../projects/project.entity';
import { GitCredential } from './git-credential.entity';

export enum GitProvider {
  GITHUB = 'github',
  GITLAB = 'gitlab',
  BITBUCKET = 'bitbucket',
  LOCAL = 'local',
}

export enum RepositoryVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
  INTERNAL = 'internal',
}

@Entity('git_repositories')
@Index(['projectId', 'provider'])
@Index(['remoteId', 'provider'], {
  unique: true,
  where: '"remoteId" IS NOT NULL',
})
export class GitRepository {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column({
    type: 'enum',
    enum: GitProvider,
    default: GitProvider.GITHUB,
  })
  provider: GitProvider;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  cloneUrl: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  sshUrl: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  defaultBranch: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  remoteId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  namespace: string;

  @Column({
    type: 'enum',
    enum: RepositoryVisibility,
    default: RepositoryVisibility.PRIVATE,
  })
  visibility: RepositoryVisibility;

  @Column({ type: 'uuid', nullable: true })
  credentialId: string;

  @ManyToOne(() => GitCredential, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'credentialId' })
  credential: GitCredential;

  @Column({ type: 'varchar', length: 500, nullable: true })
  localPath: string;

  @Column({ type: 'boolean', default: false })
  isForked: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  parentUrl: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    stars?: number;
    forks?: number;
    watchers?: number;
    openIssues?: number;
    language?: string;
    topics?: string[];
    lastCommitAt?: Date;
    size?: number;
  };

  @Column({ type: 'jsonb', nullable: true })
  webhooks: {
    id: string;
    url: string;
    events: string[];
    active: boolean;
  }[];

  @Column({ type: 'timestamp', nullable: true })
  lastSyncedAt: Date;

  @Column({ type: 'boolean', default: false })
  isHot: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}