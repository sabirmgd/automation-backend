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

@Entity('integration_test_results')
@Index(['ticketWorkflowId'])
@Index(['createdAt'])
export class IntegrationTestResult {
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

  // Server information
  @Column({ type: 'varchar', length: 50 })
  serverStatus: string; // 'started', 'failed', 'already_running'

  @Column({ type: 'integer', nullable: true })
  serverPort: number;

  @Column({ type: 'integer', nullable: true })
  serverPid: number;

  @Column({ type: 'integer', nullable: true })
  startupTimeMs: number;

  // Test results
  @Column({ type: 'integer', default: 0 })
  endpointsTested: number;

  @Column({ type: 'integer', default: 0 })
  endpointsPassed: number;

  @Column({ type: 'integer', default: 0 })
  endpointsFailed: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  avgResponseTimeMs: number;

  // Database checks
  @Column({ type: 'integer', default: 0 })
  dbOperationsCount: number;

  @Column({ type: 'boolean', nullable: true })
  dbIntegrityPassed: boolean;

  // Cleanup information
  @Column({ type: 'varchar', length: 50 })
  cleanupStatus: string; // 'success', 'partial', 'failed'

  @Column({ type: 'text', nullable: true })
  cleanupIssues: string;

  // Full report
  @Column({ type: 'text' })
  fullReport: string;

  // Detailed test results in JSON format
  @Column({ type: 'jsonb', nullable: true })
  testDetails: {
    testResults?: Array<{
      endpoint: string;
      method: string;
      path: string;
      authRequired: boolean;
      testCases: Array<{
        description: string;
        passed: boolean;
        error?: string;
        responseTime?: number;
        statusCode?: number;
      }>;
      averageResponseTime: number;
    }>;
    databaseChecks?: Array<{
      tableName: string;
      recordsCreated: number;
      recordsUpdated: number;
      integrityPassed: boolean;
      notes?: string;
    }>;
    serverLogs?: string[];
    errorLogs?: string[];
  };

  // Additional metadata
  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    customInstructions?: string;
    testDuration?: number; // Total test duration in ms
    testEnvironment?: string;
    gitBranch?: string;
    gitCommit?: string;
    [key: string]: any;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}