import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationTestResult } from './entities/integration-test-result.entity';
import { TicketWorkflow, WorkflowStatus } from './entities/ticket-workflow.entity';
import { TestingAgentService } from '../agents/testing/agent.service';
import { JiraTicketService } from '../modules/jira/services/jira-ticket.service';
import { WorktreeService } from '../git/services/worktree.service';
import { VerificationResult } from './entities/verification-result.entity';
import { HiddenCommentService } from '../modules/jira/services/hidden-comment.service';

@Injectable()
export class IntegrationTestingService {
  private readonly logger = new Logger(IntegrationTestingService.name);

  constructor(
    @InjectRepository(IntegrationTestResult)
    private readonly testResultRepository: Repository<IntegrationTestResult>,
    @InjectRepository(TicketWorkflow)
    private readonly workflowRepository: Repository<TicketWorkflow>,
    @InjectRepository(VerificationResult)
    private readonly verificationRepository: Repository<VerificationResult>,
    private readonly testingAgent: TestingAgentService,
    private readonly jiraTicketService: JiraTicketService,
    private readonly worktreeService: WorktreeService,
    private readonly hiddenCommentService: HiddenCommentService,
  ) {}

  async runIntegrationTests(
    ticketId: string,
    customInstructions?: string,
  ): Promise<IntegrationTestResult> {
    this.logger.log(`Starting integration tests for ticket ${ticketId}`);

    // Get workflow with relations
    const workflow = await this.workflowRepository.findOne({
      where: { ticketId },
      relations: ['worktree', 'project'],
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow not found for ticket ${ticketId}`);
    }

    if (!workflow.worktreeId) {
      throw new Error(`No worktree found for ticket ${ticketId}`);
    }

    // Update workflow status
    workflow.status = WorkflowStatus.TESTING_IN_PROGRESS;
    await this.workflowRepository.save(workflow);

    try {
      // Get ticket details
      const ticket = await this.jiraTicketService.findOne(ticketId);
      if (!ticket) {
        throw new NotFoundException(`Ticket ${ticketId} not found`);
      }

      // Get implementation summary from verification or hidden comments
      const implementationSummary = await this.getImplementationSummary(workflow.id, ticketId);

      // Get worktree path
      const worktree = await this.worktreeService.findOne(workflow.worktreeId);
      if (!worktree) {
        throw new NotFoundException(`Worktree ${workflow.worktreeId} not found`);
      }

      // Get testing instructions from project
      const testingInstructions = workflow.project?.agentNavigationInfo ||
        this.getDefaultTestingInstructions();

      // Parse project metadata if it exists
      let projectMetadata = {};
      try {
        if (workflow.project?.metadata?.testing) {
          projectMetadata = workflow.project.metadata.testing;
        }
      } catch (error) {
        this.logger.warn('Failed to parse project testing metadata', error);
      }

      // Run integration tests
      const report = await this.testingAgent.runIntegrationTests({
        accessToken: workflow.project?.accessToken,
        worktreePath: worktree.worktreePath,
        ticketKey: ticket.key,
        ticketDescription: `${ticket.summary}\n\n${ticket.description || ''}`,
        implementationSummary,
        testingInstructions,
        projectMetadata,
        customInstructions,
      });

      // Parse the report to extract structured data
      const parsedResults = this.testingAgent.parseTestReport(report);

      // Save test results
      const testResult = this.testResultRepository.create({
        ticketWorkflowId: workflow.id,
        worktreeId: workflow.worktreeId,
        serverStatus: parsedResults.serverStatus || 'failed',
        serverPort: parsedResults.serverPort,
        serverPid: parsedResults.serverPid,
        endpointsTested: parsedResults.summary?.totalEndpoints || 0,
        endpointsPassed: parsedResults.summary?.passedEndpoints || 0,
        endpointsFailed: parsedResults.summary?.failedEndpoints || 0,
        avgResponseTimeMs: parsedResults.summary?.averageResponseTime || 0,
        dbOperationsCount: parsedResults.summary?.databaseOperations || 0,
        cleanupStatus: parsedResults.cleanupStatus || 'failed',
        cleanupIssues: parsedResults.cleanupIssues?.join('\n'),
        fullReport: report,
        testDetails: parsedResults as any,
      });

      const savedResult = await this.testResultRepository.save(testResult);

      // Update workflow status based on test results
      const allPassed = parsedResults.summary?.allPassed || false;
      const cleanupSuccess = parsedResults.cleanupStatus === 'success';

      if (allPassed && cleanupSuccess) {
        workflow.status = WorkflowStatus.TESTING_COMPLETE;
      } else if (parsedResults.summary?.passedEndpoints && parsedResults.summary.passedEndpoints > 0) {
        workflow.status = WorkflowStatus.TESTING_PARTIAL;
      } else {
        workflow.status = WorkflowStatus.TESTING_FAILED;
      }

      workflow.metadata = {
        ...workflow.metadata,
        lastTestRunAt: new Date(),
        testStatus: workflow.status,
      };

      await this.workflowRepository.save(workflow);

      this.logger.log(`Integration testing completed for ticket ${ticketId}`);
      return savedResult;

    } catch (error) {
      this.logger.error(`Integration testing failed for ticket ${ticketId}`, error);

      // Update workflow status to error
      workflow.status = WorkflowStatus.TESTING_FAILED;
      workflow.metadata = {
        ...workflow.metadata,
        testingError: `Integration testing failed: ${error.message}`,
        testingErrorAt: new Date(),
      };
      await this.workflowRepository.save(workflow);

      throw error;
    }
  }

  async getLatestTestResults(ticketId: string): Promise<IntegrationTestResult | null> {
    const workflow = await this.workflowRepository.findOne({
      where: { ticketId },
    });

    if (!workflow) {
      return null;
    }

    return this.testResultRepository.findOne({
      where: { ticketWorkflowId: workflow.id },
      order: { createdAt: 'DESC' },
    });
  }

  async getTestHistory(ticketId: string): Promise<IntegrationTestResult[]> {
    const workflow = await this.workflowRepository.findOne({
      where: { ticketId },
    });

    if (!workflow) {
      return [];
    }

    return this.testResultRepository.find({
      where: { ticketWorkflowId: workflow.id },
      order: { createdAt: 'DESC' },
      take: 10, // Last 10 test runs
    });
  }

  private async getImplementationSummary(workflowId: string, ticketId: string): Promise<string> {
    // Try to get from verification report first
    const verification = await this.verificationRepository.findOne({
      where: { ticketWorkflowId: workflowId },
      order: { createdAt: 'DESC' },
    });

    if (verification && verification.report) {
      // Extract implementation summary from verification report
      const summaryMatch = verification.report.match(/## 1\. IMPLEMENTATION VERIFICATION SUMMARY([\s\S]*?)## 2\./);
      if (summaryMatch) {
        return summaryMatch[1].trim();
      }
    }

    // Fallback to hidden comments
    const comments = await this.hiddenCommentService.findAll(ticketId);
    const implementationComments = comments
      .filter(comment => comment.authorType === 'ai' && comment.content.includes('implementation'))
      .map(comment => comment.content)
      .join('\n\n');

    if (implementationComments) {
      return implementationComments;
    }

    // Default message
    return 'No specific implementation summary available. Test all modified functionality.';
  }

  private getDefaultTestingInstructions(): string {
    return `
Default Testing Instructions:
1. Start the backend server (check package.json for start command)
2. Test all API endpoints that were modified
3. Use appropriate authentication if required
4. Verify database operations
5. Ensure all background processes are cleaned up
6. Report any failures or issues found
`;
  }

  /**
   * Mark tests as requiring fixes
   */
  async markTestsNeedFix(ticketId: string, issues: string): Promise<void> {
    const workflow = await this.workflowRepository.findOne({
      where: { ticketId },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow not found for ticket ${ticketId}`);
    }

    workflow.status = WorkflowStatus.TESTING_NEEDS_FIX;
    workflow.metadata = {
      ...workflow.metadata,
      testIssues: issues,
      testIssuesReportedAt: new Date(),
    };

    await this.workflowRepository.save(workflow);
    this.logger.log(`Ticket ${ticketId} marked as needing test fixes`);
  }

  /**
   * Approve tests and mark ready for PR
   */
  async approveTests(ticketId: string): Promise<void> {
    const workflow = await this.workflowRepository.findOne({
      where: { ticketId },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow not found for ticket ${ticketId}`);
    }

    workflow.status = WorkflowStatus.READY_FOR_PR;
    workflow.metadata = {
      ...workflow.metadata,
      testsApprovedAt: new Date(),
    };

    await this.workflowRepository.save(workflow);
    this.logger.log(`Ticket ${ticketId} tests approved, ready for PR`);
  }
}