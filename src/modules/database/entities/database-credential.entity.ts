import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { Project } from '../../../projects/project.entity';

export enum DatabaseType {
  MYSQL = 'mysql',
  POSTGRESQL = 'postgresql',
  MONGODB = 'mongodb',
  REDIS = 'redis',
  MSSQL = 'mssql',
  ORACLE = 'oracle',
  SQLITE = 'sqlite',
}

export enum Environment {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
  TESTING = 'testing',
}

@Entity('database_credentials')
@Index(['projectId', 'environment', 'name'], { unique: true })
export class DatabaseCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: Environment,
    default: Environment.DEVELOPMENT,
  })
  environment: Environment;

  @Column({
    type: 'enum',
    enum: DatabaseType,
  })
  dbType: DatabaseType;

  @Column({ type: 'varchar', length: 255 })
  host: string;

  @Column({ type: 'int' })
  port: number;

  @Column({ type: 'varchar', length: 255 })
  database: string;

  @Column({ type: 'varchar', length: 255 })
  username: string;

  @Column({ type: 'text', select: false })
  encryptedPassword: string;

  @Column({ type: 'jsonb', nullable: true })
  sslConfig: {
    enabled?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
    rejectUnauthorized?: boolean;
  };

  @Column({ type: 'jsonb', nullable: true })
  connectionOptions: {
    connectionTimeout?: number;
    requestTimeout?: number;
    pool?: {
      min?: number;
      max?: number;
      idleTimeoutMillis?: number;
    };
    charset?: string;
    timezone?: string;
    [key: string]: any;
  };

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    region?: string;
    cluster?: string;
    replicaSet?: string;
    authSource?: string;
    tags?: string[];
    [key: string]: any;
  };

  @Column({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastConnectionTest: Date;

  @Column({ type: 'boolean', nullable: true })
  lastConnectionStatus: boolean;

  @Column({ type: 'text', nullable: true })
  lastConnectionError: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  createdBy: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  updatedBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}