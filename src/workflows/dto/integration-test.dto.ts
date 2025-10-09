import { IsString, IsOptional, IsObject } from 'class-validator';

export class RunIntegrationTestDto {
  @IsOptional()
  @IsString()
  customInstructions?: string;

  @IsOptional()
  @IsObject()
  testConfiguration?: {
    skipServerStartup?: boolean;
    skipDatabaseChecks?: boolean;
    specificEndpoints?: string[];
    timeout?: number; // in milliseconds
  };
}

export class MarkTestsNeedFixDto {
  @IsString()
  issues: string;

  @IsOptional()
  @IsString()
  fixInstructions?: string;
}

export class IntegrationTestResultDto {
  id: string;
  ticketWorkflowId: string;
  worktreeId: string;

  // Server info
  serverStatus: string;
  serverPort?: number;
  serverPid?: number;
  startupTimeMs?: number;

  // Test results
  endpointsTested: number;
  endpointsPassed: number;
  endpointsFailed: number;
  avgResponseTimeMs?: number;

  // Database checks
  dbOperationsCount: number;
  dbIntegrityPassed?: boolean;

  // Cleanup
  cleanupStatus: string;
  cleanupIssues?: string;

  // Report
  fullReport: string;
  testDetails?: any;
  metadata?: any;

  createdAt: Date;
  updatedAt: Date;
}

export class TestSummaryDto {
  status: 'in_progress' | 'complete' | 'partial' | 'failed';
  latestRun?: IntegrationTestResultDto;
  totalRuns: number;
  successRate: number; // percentage
  averageTestDuration?: number; // in ms
  lastRunAt?: Date;
}