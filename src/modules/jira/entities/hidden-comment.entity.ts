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

export enum AuthorType {
  USER = 'user',
  AI = 'ai',
}

@Entity('hidden_comments')
export class HiddenComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => JiraTicket, { onDelete: 'CASCADE' })
  @JoinColumn()
  ticket: JiraTicket;

  @Column()
  ticketId: string;

  @Column('text')
  content: string;

  @Column({
    type: 'enum',
    enum: AuthorType,
    default: AuthorType.USER,
  })
  authorType: AuthorType;

  @Column({ nullable: true })
  authorName: string;

  @Column({ nullable: true })
  sessionId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}