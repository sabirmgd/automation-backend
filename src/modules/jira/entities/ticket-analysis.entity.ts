import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { JiraTicket } from './jira-ticket.entity';
import { JiraUser } from './jira-user.entity';

export enum AnalysisType {
  COMPLEXITY = 'complexity',
  SENTIMENT = 'sentiment',
  PRIORITY = 'priority',
  RISK = 'risk',
  EFFORT = 'effort',
  CUSTOM = 'custom',
}

export enum AnalysisStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('ticket_analyses')
export class TicketAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => JiraTicket, (ticket) => ticket.analyses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  ticket: JiraTicket;

  @Column()
  ticketId: string;

  @Column({
    type: 'enum',
    enum: AnalysisType,
    default: AnalysisType.CUSTOM,
  })
  analysisType: AnalysisType;

  @Column({
    type: 'enum',
    enum: AnalysisStatus,
    default: AnalysisStatus.PENDING,
  })
  status: AnalysisStatus;

  @Column({ nullable: true })
  analysisName: string;

  @Column('text', { nullable: true })
  summary: string;

  @Column({ type: 'jsonb', nullable: true })
  metrics: {
    complexity?: number;
    estimatedHours?: number;
    riskLevel?: string;
    sentiment?: string;
    priority?: number;
    confidence?: number;
    [key: string]: any;
  };

  @Column({ type: 'jsonb', nullable: true })
  recommendations: {
    action?: string;
    reasoning?: string;
    suggestedAssignee?: string;
    suggestedPriority?: string;
    suggestedLabels?: string[];
    [key: string]: any;
  };

  @Column({ type: 'jsonb', nullable: true })
  insights: {
    patterns?: string[];
    dependencies?: string[];
    blockers?: string[];
    relatedTickets?: string[];
    [key: string]: any;
  };

  @Column('text', { nullable: true })
  rawAnalysisData: string;

  @Column({ nullable: true })
  analysisEngine: string;

  @Column({ nullable: true })
  modelVersion: string;

  @ManyToOne(() => JiraUser, { nullable: true })
  @JoinColumn()
  analyzedBy: JiraUser;

  @Column({ nullable: true })
  analyzedById: string;

  @Column({ nullable: true })
  errorMessage: string;

  @Column({ nullable: true })
  processingTime: number;

  @Column({ nullable: true })
  completedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}