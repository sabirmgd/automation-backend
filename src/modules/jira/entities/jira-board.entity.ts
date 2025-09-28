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
import { JiraTicket } from './jira-ticket.entity';
import { JiraProject } from './jira-project.entity';
import { Project } from '../../../projects/project.entity';

@Entity('jira_boards')
export class JiraBoard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  boardId: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  type: string;

  @Column({ nullable: true })
  projectKey: string;

  @Column({ nullable: true })
  projectName: string;

  @ManyToOne(() => JiraAccount, (account) => account.boards, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  account: JiraAccount;

  @Column()
  accountId: string;

  @ManyToOne(() => JiraProject, (project) => project.boards, { nullable: true })
  @JoinColumn()
  project: JiraProject;

  @Column({ nullable: true })
  projectId: string;

  @ManyToOne(() => Project, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mainProjectId' })
  mainProject: Project;

  @Column({ nullable: true })
  mainProjectId: string;

  @OneToMany(() => JiraTicket, (ticket) => ticket.board)
  tickets: JiraTicket[];

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  lastSyncedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}