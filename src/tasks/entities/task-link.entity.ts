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
import { Task } from './task.entity';

export enum TaskLinkType {
  JIRA_TICKET = 'jira_ticket',
  PULL_REQUEST = 'pull_request',
  MERGE_REQUEST = 'merge_request',
  ISSUE = 'issue',
  DOCUMENT = 'document',
  OTHER = 'other',
}

@Entity('task_links')
@Index(['taskId', 'linkType', 'externalId'], { unique: true })
export class TaskLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  taskId: string;

  @ManyToOne(() => Task, (task) => task.links, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: Task;

  @Column({
    type: 'enum',
    enum: TaskLinkType,
  })
  linkType: TaskLinkType;

  @Column({ type: 'varchar', length: 255 })
  externalId: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  externalUrl: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  status: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  platform: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}