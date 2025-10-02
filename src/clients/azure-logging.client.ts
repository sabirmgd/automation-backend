import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LogsQueryClient, LogsQueryResultStatus, LogsTable } from '@azure/monitor-query-logs';
import { DefaultAzureCredential, AzureCliCredential } from '@azure/identity';

export interface AzureLogQueryOptions {
  duration?: string; // e.g., 'PT1H' for 1 hour, 'P1D' for 1 day
  maxResults?: number;
}

export interface ContainerAppLogQuery {
  appName?: string;
  severity?: 'Info' | 'Warning' | 'Error' | 'Critical';
  searchText?: string;
  startTime?: Date;
  endTime?: Date;
}

@Injectable()
export class AzureLoggingClient implements OnModuleInit {
  private readonly logger = new Logger(AzureLoggingClient.name);
  private logsQueryClient: LogsQueryClient;
  private workspaceId: string;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    // Initialize with Azure CLI credentials for local development
    // TODO: Replace with database credentials in production
    const credential = new DefaultAzureCredential();

    this.logsQueryClient = new LogsQueryClient(credential);
    this.workspaceId = this.configService.get<string>('azure.workspaceId');

    this.logger.log('Azure Logging Client initialized');
  }

  /**
   * Query Container App console logs
   */
  async queryContainerAppLogs(
    query: ContainerAppLogQuery,
    options: AzureLogQueryOptions = {}
  ) {
    try {
      const kqlQuery = this.buildContainerAppQuery(query);
      const duration = options.duration || 'PT1H'; // Default to last 1 hour

      this.logger.debug(`Executing KQL query: ${kqlQuery}`);

      const result = await this.logsQueryClient.queryWorkspace(
        this.workspaceId,
        kqlQuery,
        { duration }
      );

      if (result.status === LogsQueryResultStatus.Success) {
        return this.formatQueryResults(result.tables[0]);
      } else {
        this.logger.error('Query failed:', result.partialError);
        throw new Error(`Query failed: ${result.partialError?.message}`);
      }
    } catch (error) {
      this.logger.error('Error querying Container App logs:', error);
      throw error;
    }
  }

  /**
   * Query Container App system logs
   */
  async queryContainerAppSystemLogs(
    appName: string,
    options: AzureLogQueryOptions = {}
  ) {
    try {
      const kqlQuery = `
        ContainerAppSystemLogs_CL
        | where ContainerAppName_s == "${appName}"
        | order by TimeGenerated desc
        | take ${options.maxResults || 50}
      `;

      const duration = options.duration || 'PT1H';

      const result = await this.logsQueryClient.queryWorkspace(
        this.workspaceId,
        kqlQuery,
        { duration }
      );

      if (result.status === LogsQueryResultStatus.Success) {
        return this.formatQueryResults(result.tables[0]);
      } else {
        throw new Error(`Query failed: ${result.partialError?.message}`);
      }
    } catch (error) {
      this.logger.error('Error querying system logs:', error);
      throw error;
    }
  }

  /**
   * Get Container App metrics (CPU, Memory, etc.)
   */
  async queryContainerAppMetrics(
    appName: string,
    metricName: 'CpuUsage' | 'MemoryUsage' | 'RequestCount',
    options: AzureLogQueryOptions = {}
  ) {
    try {
      const kqlQuery = `
        ContainerAppMetrics_CL
        | where ContainerAppName_s == "${appName}"
        | where MetricName_s == "${metricName}"
        | summarize avg(MetricValue_d) by bin(TimeGenerated, 5m)
        | order by TimeGenerated desc
        | take ${options.maxResults || 100}
      `;

      const duration = options.duration || 'PT6H'; // Default to last 6 hours for metrics

      const result = await this.logsQueryClient.queryWorkspace(
        this.workspaceId,
        kqlQuery,
        { duration }
      );

      if (result.status === LogsQueryResultStatus.Success) {
        return this.formatQueryResults(result.tables[0]);
      } else {
        throw new Error(`Query failed: ${result.partialError?.message}`);
      }
    } catch (error) {
      this.logger.error('Error querying metrics:', error);
      throw error;
    }
  }

  /**
   * Execute a custom KQL query
   */
  async executeCustomQuery(
    kqlQuery: string,
    options: AzureLogQueryOptions = {}
  ) {
    try {
      const duration = options.duration || 'PT1H';

      const result = await this.logsQueryClient.queryWorkspace(
        this.workspaceId,
        kqlQuery,
        { duration }
      );

      if (result.status === LogsQueryResultStatus.Success) {
        return this.formatQueryResults(result.tables[0]);
      } else {
        throw new Error(`Query failed: ${result.partialError?.message}`);
      }
    } catch (error) {
      this.logger.error('Error executing custom query:', error);
      throw error;
    }
  }

  /**
   * Stream logs in real-time (polls for new logs)
   */
  async *streamContainerAppLogs(
    appName: string,
    pollingInterval: number = 5000
  ): AsyncGenerator<any[]> {
    let lastTimestamp = new Date();

    while (true) {
      try {
        const kqlQuery = `
          ContainerAppConsoleLogs_CL
          | where ContainerAppName_s == "${appName}"
          | where TimeGenerated > datetime(${lastTimestamp.toISOString()})
          | order by TimeGenerated asc
        `;

        const result = await this.logsQueryClient.queryWorkspace(
          this.workspaceId,
          kqlQuery,
          { duration: 'PT5M' } // Look at last 5 minutes
        );

        if (result.status === LogsQueryResultStatus.Success && result.tables[0].rows.length > 0) {
          const logs = this.formatQueryResults(result.tables[0]);
          if (logs.length > 0) {
            lastTimestamp = new Date(logs[logs.length - 1].TimeGenerated);
            yield logs;
          }
        }

        await new Promise(resolve => setTimeout(resolve, pollingInterval));
      } catch (error) {
        this.logger.error('Error streaming logs:', error);
        throw error;
      }
    }
  }

  /**
   * Build KQL query for Container App logs
   */
  private buildContainerAppQuery(query: ContainerAppLogQuery): string {
    const conditions: string[] = [];

    if (query.appName) {
      conditions.push(`ContainerAppName_s == "${query.appName}"`);
    }

    if (query.severity) {
      conditions.push(`Log_level_s == "${query.severity}"`);
    }

    if (query.searchText) {
      conditions.push(`Log_s contains "${query.searchText}"`);
    }

    if (query.startTime) {
      conditions.push(`TimeGenerated >= datetime(${query.startTime.toISOString()})`);
    }

    if (query.endTime) {
      conditions.push(`TimeGenerated <= datetime(${query.endTime.toISOString()})`);
    }

    const whereClause = conditions.length > 0
      ? `| where ${conditions.join(' and ')}`
      : '';

    return `
      ContainerAppConsoleLogs_CL
      ${whereClause}
      | order by TimeGenerated desc
      | take 100
    `.trim();
  }

  /**
   * Format query results into a more usable structure
   */
  private formatQueryResults(table: LogsTable): any[] {
    if (!table || !table.rows) {
      return [];
    }

    const columns = table.columnDescriptors?.map(col => col.name) || [];

    return table.rows.map(row => {
      const formattedRow: any = {};
      columns.forEach((col, index) => {
        formattedRow[col] = row[index];
      });
      return formattedRow;
    });
  }

  /**
   * Update workspace ID (for when switching between environments)
   */
  setWorkspaceId(workspaceId: string) {
    this.workspaceId = workspaceId;
    this.logger.log(`Updated workspace ID to: ${workspaceId}`);
  }

  /**
   * Update credentials (for future database integration)
   */
  async updateCredentials(credential: any) {
    this.logsQueryClient = new LogsQueryClient(credential);
    this.logger.log('Updated Azure credentials');
  }
}