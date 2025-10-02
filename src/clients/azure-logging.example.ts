/**
 * Azure Logging Client Usage Examples
 *
 * Prerequisites:
 * 1. Make sure you're logged in with Azure CLI: `az login`
 * 2. Add to your .env file:
 *    AZURE_WORKSPACE_ID=your-log-analytics-workspace-id
 *
 * To find your workspace ID:
 * az monitor log-analytics workspace list --query "[].{name:name, id:customerId}" -o table
 */

import { Controller, Get, Query, Param } from '@nestjs/common';
import { AzureLoggingClient } from './azure-logging.client';

@Controller('logs')
export class LogsController {
  constructor(private readonly azureLoggingClient: AzureLoggingClient) {}

  /**
   * Example 1: Get Container App console logs
   * GET /logs/container-app/:appName
   */
  @Get('container-app/:appName')
  async getContainerAppLogs(
    @Param('appName') appName: string,
    @Query('duration') duration?: string,
    @Query('severity') severity?: 'Info' | 'Warning' | 'Error' | 'Critical',
  ) {
    const logs = await this.azureLoggingClient.queryContainerAppLogs(
      {
        appName,
        severity,
      },
      {
        duration: duration || 'PT1H', // Default to last 1 hour
        maxResults: 100,
      }
    );

    return logs;
  }

  /**
   * Example 2: Get Container App system logs
   * GET /logs/system/:appName
   */
  @Get('system/:appName')
  async getSystemLogs(@Param('appName') appName: string) {
    const logs = await this.azureLoggingClient.queryContainerAppSystemLogs(
      appName,
      {
        duration: 'PT24H', // Last 24 hours
        maxResults: 50,
      }
    );

    return logs;
  }

  /**
   * Example 3: Get Container App metrics
   * GET /logs/metrics/:appName/:metric
   */
  @Get('metrics/:appName/:metric')
  async getMetrics(
    @Param('appName') appName: string,
    @Param('metric') metric: 'CpuUsage' | 'MemoryUsage' | 'RequestCount',
  ) {
    const metrics = await this.azureLoggingClient.queryContainerAppMetrics(
      appName,
      metric,
      {
        duration: 'PT6H', // Last 6 hours
        maxResults: 100,
      }
    );

    return metrics;
  }

  /**
   * Example 4: Search logs with text
   * GET /logs/search/:appName?text=error
   */
  @Get('search/:appName')
  async searchLogs(
    @Param('appName') appName: string,
    @Query('text') searchText: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const logs = await this.azureLoggingClient.queryContainerAppLogs(
      {
        appName,
        searchText,
        startTime: from ? new Date(from) : undefined,
        endTime: to ? new Date(to) : undefined,
      },
      {
        duration: 'P7D', // Last 7 days
      }
    );

    return logs;
  }

  /**
   * Example 5: Execute custom KQL query
   * POST /logs/query
   * Body: { query: "ContainerAppConsoleLogs_CL | take 10" }
   */
  @Get('query')
  async executeQuery(@Query('kql') kqlQuery: string) {
    const results = await this.azureLoggingClient.executeCustomQuery(
      kqlQuery,
      {
        duration: 'PT1H',
      }
    );

    return results;
  }
}

/**
 * Example Service Usage (Injectable)
 */
import { Injectable } from '@nestjs/common';

@Injectable()
export class MonitoringService {
  constructor(private readonly azureLoggingClient: AzureLoggingClient) {}

  /**
   * Monitor application errors
   */
  async checkForErrors(appName: string) {
    const errorLogs = await this.azureLoggingClient.queryContainerAppLogs(
      {
        appName,
        severity: 'Error',
      },
      {
        duration: 'PT1H', // Last hour
      }
    );

    if (errorLogs.length > 0) {
      // Send alert, create incident, etc.
      console.error(`Found ${errorLogs.length} errors in ${appName}`);
      return errorLogs;
    }

    return [];
  }

  /**
   * Stream logs in real-time (async generator)
   */
  async monitorLogsRealtime(appName: string) {
    const logStream = this.azureLoggingClient.streamContainerAppLogs(appName, 5000);

    for await (const logs of logStream) {
      console.log(`New logs received: ${logs.length} entries`);

      // Process each batch of logs
      logs.forEach(log => {
        console.log(`[${log.TimeGenerated}] ${log.Log_s}`);
      });
    }
  }

  /**
   * Get performance metrics summary
   */
  async getPerformanceSummary(appName: string) {
    const [cpu, memory, requests] = await Promise.all([
      this.azureLoggingClient.queryContainerAppMetrics(appName, 'CpuUsage', {
        duration: 'PT1H',
      }),
      this.azureLoggingClient.queryContainerAppMetrics(appName, 'MemoryUsage', {
        duration: 'PT1H',
      }),
      this.azureLoggingClient.queryContainerAppMetrics(appName, 'RequestCount', {
        duration: 'PT1H',
      }),
    ]);

    return {
      cpu: this.calculateAverage(cpu),
      memory: this.calculateAverage(memory),
      totalRequests: this.sumValues(requests),
    };
  }

  private calculateAverage(metrics: any[]): number {
    if (metrics.length === 0) return 0;
    const sum = metrics.reduce((acc, m) => acc + (m.avg_MetricValue_d || 0), 0);
    return sum / metrics.length;
  }

  private sumValues(metrics: any[]): number {
    return metrics.reduce((acc, m) => acc + (m.avg_MetricValue_d || 0), 0);
  }
}

/**
 * Configuration (.env or config/configuration.ts)
 *
 * Add to your configuration:
 *
 * azure: {
 *   workspaceId: process.env.AZURE_WORKSPACE_ID,
 *   // Future: Add more config as needed
 *   // tenantId: process.env.AZURE_TENANT_ID,
 *   // clientId: process.env.AZURE_CLIENT_ID,
 * }
 *
 * KQL Query Examples:
 *
 * 1. Get all logs for an app:
 *    ContainerAppConsoleLogs_CL | where ContainerAppName_s == "my-app"
 *
 * 2. Get errors in last hour:
 *    ContainerAppConsoleLogs_CL
 *    | where TimeGenerated > ago(1h) and Log_level_s == "Error"
 *
 * 3. Count logs by severity:
 *    ContainerAppConsoleLogs_CL
 *    | summarize count() by Log_level_s
 *
 * 4. Get deployment events:
 *    ContainerAppSystemLogs_CL
 *    | where EventCategory_s == "Deployment"
 *
 * Duration formats:
 * - PT1H = 1 hour
 * - PT24H = 24 hours
 * - P1D = 1 day
 * - P7D = 7 days
 * - P30D = 30 days
 */