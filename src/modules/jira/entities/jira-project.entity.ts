import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { JiraAccount } from './jira-account.entity';
import { JiraBoard } from './jira-board.entity';
import { JiraTicket } from './jira-ticket.entity';

@Entity('jira_projects')
export class JiraProject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @Column({ unique: true })
  key: string;

  @Column()
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column({ nullable: true })
  projectType: string;

  @Column({ nullable: true })
  category: string;

  @Column({ nullable: true })
  leadAccountId: string;

  @Column({ nullable: true })
  leadName: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @ManyToOne(() => JiraAccount, (account) => account.jiraProjects, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  account: JiraAccount;

  @Column()
  accountId: string;

  @OneToMany(() => JiraBoard, (board) => board.project)
  boards: JiraBoard[];

  @OneToMany(() => JiraTicket, (ticket) => ticket.project)
  tickets: JiraTicket[];

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  style: string;

  @Column({ nullable: true })
  issueTypeScheme: string;

  @Column('simple-array', { nullable: true })
  issueTypes: string[];

  @Column('simple-array', { nullable: true })
  components: string[];

  @Column('simple-array', { nullable: true })
  versions: string[];

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    permissions?: Record<string, boolean>;
    customFields?: Record<string, any>;
    workflows?: string[];
    [key: string]: any;
  };

  @Column({ nullable: true })
  lastSyncedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}