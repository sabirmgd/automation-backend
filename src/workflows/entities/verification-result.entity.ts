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
import { TicketWorkflow } from './ticket-workflow.entity';
import { Worktree } from '../../git/entities/worktree.entity';

@Entity('verification_results')
@Index(['ticketWorkflowId'])
@Index(['worktreeId'])
@Index(['createdAt'])
export class VerificationResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ticketWorkflowId: string;

  @ManyToOne(() => TicketWorkflow, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticketWorkflowId' })
  ticketWorkflow: TicketWorkflow;

  @Column({ type: 'uuid' })
  worktreeId: string;

  @ManyToOne(() => Worktree, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'worktreeId' })
  worktree: Worktree;

  @Column({ type: 'text' })
  report: string;

  @Column({ type: 'text', nullable: true })
  reviewNotes: string;

  @Column({ nullable: true })
  reviewedBy: string;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}