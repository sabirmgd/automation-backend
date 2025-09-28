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
import { JiraBoard } from './jira-board.entity';
import { JiraProject } from './jira-project.entity';
import { Project } from '../../../projects/project.entity';

@Entity('jira_accounts')
export class JiraAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  accountName: string;

  @Column()
  jiraUrl: string;

  @Column()
  email: string;

  @Column({ select: false })
  encryptedApiToken: string;

  @Column({ type: 'uuid', nullable: true })
  projectId: string;

  @ManyToOne(() => Project, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  accountType: string;

  @Column({ nullable: true })
  cloudId: string;

  @Column({ nullable: true })
  currentUserAccountId: string;

  @OneToMany(() => JiraBoard, (board) => board.account)
  boards: JiraBoard[];

  @OneToMany(() => JiraProject, (jiraProject) => jiraProject.account)
  jiraProjects: JiraProject[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  lastSyncedAt: Date;
}