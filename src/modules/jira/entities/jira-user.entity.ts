import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { JiraTicket } from './jira-ticket.entity';

@Entity('jira_users')
export class JiraUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  accountId: string;

  @Column()
  displayName: string;

  @Column({ unique: true, nullable: true })
  emailAddress: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  timeZone: string;

  @Column({ nullable: true })
  accountType: string;

  @OneToMany(() => JiraTicket, (ticket) => ticket.assignee)
  assignedTickets: JiraTicket[];

  @OneToMany(() => JiraTicket, (ticket) => ticket.reporter)
  reportedTickets: JiraTicket[];

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    groups?: string[];
    roles?: string[];
    permissions?: string[];
    [key: string]: any;
  };

  @Column({ nullable: true })
  lastActiveAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}