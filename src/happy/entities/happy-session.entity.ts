import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Worktree } from '../../git/entities/worktree.entity';

export enum HappySessionStatus {
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPED = 'stopped',
  CRASHED = 'crashed',
}

@Entity('happy_sessions')
export class HappySession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string;

  @Column({ nullable: true })
  processId: number;

  @Column({
    type: 'enum',
    enum: HappySessionStatus,
    default: HappySessionStatus.STARTING,
  })
  status: HappySessionStatus;

  @Column({ nullable: true })
  projectId: string;

  @Column({ nullable: true })
  ticketId: string;

  @Column({ nullable: true })
  workingDirectory: string;

  @Column({ type: 'uuid', nullable: true })
  worktreeId: string;

  @ManyToOne(() => Worktree, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'worktreeId' })
  worktree: Worktree;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  startedAt: Date;

  @Column({ nullable: true })
  stoppedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}