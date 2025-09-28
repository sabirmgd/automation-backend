import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { GitRepository } from './git-repository.entity';
import { Project } from '../../projects/project.entity';

export enum CredentialType {
  PERSONAL_ACCESS_TOKEN = 'personal_access_token',
  OAUTH_TOKEN = 'oauth_token',
  SSH_KEY = 'ssh_key',
  API_KEY = 'api_key',
  USERNAME_PASSWORD = 'username_password',
}

@Entity('git_credentials')
@Index(['name', 'provider'], { unique: true })
export class GitCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: CredentialType,
    default: CredentialType.PERSONAL_ACCESS_TOKEN,
  })
  type: CredentialType;

  @Column({ type: 'varchar', length: 50 })
  provider: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  baseUrl: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  username: string;

  @Column({ type: 'text', select: false })
  encryptedToken: string;

  @Column({ type: 'text', nullable: true, select: false })
  encryptedPassword: string;

  @Column({ type: 'text', nullable: true, select: false })
  encryptedPrivateKey: string;

  @Column({ type: 'text', nullable: true })
  publicKey: string;

  @Column({ type: 'simple-array', nullable: true })
  scopes: string[];

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    organizationId?: string;
    organizationName?: string;
    apiVersion?: string;
    region?: string;
    customHeaders?: Record<string, string>;
  };

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastValidatedAt: Date;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'uuid', nullable: true })
  projectId: string;

  @ManyToOne(() => Project, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @OneToMany(() => GitRepository, (repo) => repo.credential)
  repositories: GitRepository[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}