import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  ManyToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { JiraBoard } from './jira-board.entity';
import { JiraProject } from './jira-project.entity';
import { JiraUser } from './jira-user.entity';
import { TicketAnalysis } from './ticket-analysis.entity';
import { PullRequest } from '../../../git/entities/pull-request.entity';
import { Project } from '../../../projects/project.entity';

@Entity('jira_tickets')
export class JiraTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string;

  @Column()
  summary: string;

  @Column('text', { nullable: true })
  description: string;

  @Column()
  issueType: string;

  @Column()
  status: string;

  @Column({ nullable: true })
  priority: string;

  @Column({ nullable: true })
  resolution: string;

  @ManyToOne(() => JiraBoard, (board) => board.tickets, { onDelete: 'CASCADE' })
  @JoinColumn()
  board: JiraBoard;

  @Column()
  boardId: string;

  @ManyToOne(() => JiraProject, (project) => project.tickets, {
    nullable: true,
  })
  @JoinColumn()
  project: JiraProject;

  @Column({ nullable: true })
  projectId: string;

  @ManyToOne(() => Project, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mainProjectId' })
  mainProject: Project;

  @Column({ nullable: true })
  mainProjectId: string;

  @ManyToOne(() => JiraUser, (user) => user.assignedTickets, { nullable: true })
  @JoinColumn()
  assignee: JiraUser;

  @Column({ nullable: true })
  assigneeId: string;

  @ManyToOne(() => JiraUser, (user) => user.reportedTickets, { nullable: true })
  @JoinColumn()
  reporter: JiraUser;

  @Column({ nullable: true })
  reporterId: string;

  @OneToMany(() => TicketAnalysis, (analysis) => analysis.ticket)
  analyses: TicketAnalysis[];

  @ManyToMany(() => PullRequest, (pullRequest) => pullRequest.linkedTickets)
  pullRequests: PullRequest[];

  @Column('simple-array', { nullable: true })
  labels: string[];

  @Column('simple-array', { nullable: true })
  components: string[];

  @Column({ nullable: true })
  storyPoints: number;

  @Column({ nullable: true })
  originalEstimate: number;

  @Column({ nullable: true })
  remainingEstimate: number;

  @Column({ nullable: true })
  timeSpent: number;

  @Column({ nullable: true })
  epicKey: string;

  @Column({ nullable: true })
  parentKey: string;

  @Column({ nullable: true })
  sprintId: string;

  @Column({ nullable: true })
  sprintName: string;

  @Column({ type: 'jsonb', nullable: true })
  customFields: Record<string, any>;

  @Column({ nullable: true })
  dueDate: Date;

  @Column({ nullable: true })
  jiraCreatedAt: Date;

  @Column({ nullable: true })
  jiraUpdatedAt: Date;

  @Column({ nullable: true })
  lastSyncedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}