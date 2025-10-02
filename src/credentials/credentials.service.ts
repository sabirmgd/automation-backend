import { Injectable, NotFoundException } from '@nestjs/common';
import { GitCredentialsService } from '../git/services/git-credentials.service';
import { DatabaseCredentialService } from '../modules/database/services/database-credential.service';
import { JiraAccountService } from '../modules/jira/services/jira-account.service';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { UpdateCredentialDto } from './dto/update-credential.dto';

export enum UnifiedServiceType {
  // Git providers
  GITHUB = 'github',
  GITLAB = 'gitlab',
  BITBUCKET = 'bitbucket',

  // Project management
  JIRA = 'jira',
  LINEAR = 'linear',
  ASANA = 'asana',

  // CI/CD
  JENKINS = 'jenkins',
  CIRCLECI = 'circleci',
  GITHUB_ACTIONS = 'github-actions',

  // Cloud providers
  AWS = 'aws',
  GCP = 'gcp',
  AZURE = 'azure',

  // Databases
  POSTGRESQL = 'postgresql',
  MYSQL = 'mysql',
  MONGODB = 'mongodb',
  REDIS = 'redis',

  // Other
  API = 'api',
  WEBHOOK = 'webhook',
  CUSTOM = 'custom',
}

@Injectable()
export class CredentialsService {
  constructor(
    private readonly gitCredentialsService: GitCredentialsService,
    private readonly databaseCredentialService: DatabaseCredentialService,
    private readonly jiraAccountService: JiraAccountService,
  ) {}

  private isGitService(service: string): boolean {
    return ['github', 'gitlab', 'bitbucket'].includes(service);
  }

  private isApiService(service: string): boolean {
    return ['jira', 'linear', 'jenkins', 'api', 'webhook'].includes(service);
  }

  private isDatabaseService(service: string): boolean {
    return ['postgresql', 'mysql', 'mongodb', 'redis'].includes(service);
  }

  async create(createCredentialDto: CreateCredentialDto) {
    const { service } = createCredentialDto;

    if (this.isGitService(service)) {
      // Map to Git credential format and delegate to GitCredentialsService
      return this.gitCredentialsService.create({
        name: createCredentialDto.name,
        description: createCredentialDto.description,
        type: this.mapToGitCredentialType(createCredentialDto.type),
        provider: service,
        username: createCredentialDto.metadata?.username,
        token: createCredentialDto.secret,
        privateKey: createCredentialDto.secret, // If SSH key
        projectId: createCredentialDto.projectId,
        isActive: true,
        isDefault: createCredentialDto.isDefault,
        metadata: createCredentialDto.metadata,
      });
    }

    if (this.isDatabaseService(service)) {
      // Map to Database credential format
      return this.databaseCredentialService.create({
        name: createCredentialDto.name,
        description: createCredentialDto.description,
        dbType: this.mapToDatabaseType(service),
        environment: 'development' as any,
        host: createCredentialDto.metadata?.endpoint || 'localhost',
        port: createCredentialDto.metadata?.port || this.getDefaultPort(service),
        database: createCredentialDto.metadata?.database || 'default',
        username: createCredentialDto.metadata?.username,
        password: createCredentialDto.secret,
        projectId: createCredentialDto.projectId,
      } as any);
    }

    // For Jira, use the JiraAccount entity
    if (service === 'jira') {
      const jiraAccount = await this.jiraAccountService.create({
        accountName: createCredentialDto.name,
        jiraUrl: createCredentialDto.metadata?.endpoint || 'https://atlassian.net',
        email: createCredentialDto.metadata?.username || '',
        apiToken: createCredentialDto.secret,
        projectId: createCredentialDto.projectId,
        isActive: true,
      });

      // Return in unified format
      return this.mapJiraAccountToUnified(jiraAccount);
    }

    // For other API services, store in Git credentials table
    if (this.isApiService(service)) {
      return this.gitCredentialsService.create({
        name: createCredentialDto.name,
        description: createCredentialDto.description,
        type: createCredentialDto.type === 'api_key' ? 'api_key' as any : 'personal_access_token' as any,
        provider: service,
        baseUrl: createCredentialDto.metadata?.endpoint,
        username: createCredentialDto.metadata?.username,
        token: createCredentialDto.secret,
        projectId: createCredentialDto.projectId,
        isActive: true,
        isDefault: createCredentialDto.isDefault,
        metadata: createCredentialDto.metadata,
      });
    }

    // For any other services
    return this.gitCredentialsService.create({
      name: createCredentialDto.name,
      description: createCredentialDto.description,
      type: 'api_key' as any,
      provider: service,
      username: createCredentialDto.metadata?.username,
      token: createCredentialDto.secret,
      projectId: createCredentialDto.projectId,
      isActive: true,
      metadata: createCredentialDto.metadata,
    });
  }

  async findAll(service?: string, projectId?: string) {
    const credentials = [];
    const processedServices = new Set<string>();

    // If no service specified, get all credentials from all sources
    if (!service) {
      // Get all Git/API credentials
      const allGitCreds = await this.gitCredentialsService.findAll(
        undefined,
        projectId,
      );
      // Filter out 'jira' provider as we'll get those from JiraAccount
      credentials.push(
        ...allGitCreds
          .filter(cred => cred.provider !== 'jira')
          .map(cred => this.mapGitCredentialToUnified(cred)),
      );

      // Get Jira accounts
      const jiraAccounts = await this.jiraAccountService.findAll(projectId);
      credentials.push(
        ...jiraAccounts.map(account => this.mapJiraAccountToUnified(account)),
      );

      // Also get database credentials
      const dbCreds = await this.databaseCredentialService.findAll(projectId);
      credentials.push(
        ...dbCreds.map(cred => this.mapDatabaseCredentialToUnified(cred)),
      );
    } else {
      // Service-specific queries
      if (this.isGitService(service)) {
        const gitCreds = await this.gitCredentialsService.findAll(
          service as any,
          projectId,
        );
        credentials.push(
          ...gitCreds.map(cred => this.mapGitCredentialToUnified(cred)),
        );
      } else if (service === 'jira') {
        // Get Jira accounts
        const jiraAccounts = await this.jiraAccountService.findAll(projectId);
        credentials.push(
          ...jiraAccounts.map(account => this.mapJiraAccountToUnified(account)),
        );
      } else if (this.isDatabaseService(service)) {
        const dbCreds = await this.databaseCredentialService.findAll(projectId);
        credentials.push(
          ...dbCreds
            .filter(cred => cred.dbType === service)
            .map(cred => this.mapDatabaseCredentialToUnified(cred)),
        );
      } else {
        // For API services and others
        const otherCreds = await this.gitCredentialsService.findAll(
          service as any,
          projectId,
        );
        credentials.push(
          ...otherCreds.map(cred => this.mapGitCredentialToUnified(cred)),
        );
      }
    }

    // Remove duplicates by ID
    const uniqueCredentials = Array.from(
      new Map(credentials.map(cred => [cred.id, cred])).values()
    );

    return uniqueCredentials;
  }

  async findOne(id: string, includeSecret?: boolean) {
    // Try Git credentials first
    try {
      const gitCred = await this.gitCredentialsService.findOne(id);
      if (gitCred) {
        const unified = this.mapGitCredentialToUnified(gitCred);
        if (!includeSecret) {
          delete (unified as any).secret;
        }
        return unified;
      }
    } catch (error) {
      // Not found in Git credentials
    }

    // Try Jira accounts
    try {
      const jiraAccount = await this.jiraAccountService.findOne(id);
      if (jiraAccount) {
        const unified = this.mapJiraAccountToUnified(jiraAccount);
        if (!includeSecret) {
          delete (unified as any).secret;
        }
        return unified;
      }
    } catch (error) {
      // Not found in Jira accounts
    }

    // Try Database credentials
    try {
      const dbCred = await this.databaseCredentialService.findOne(id);
      if (dbCred) {
        const unified = this.mapDatabaseCredentialToUnified(dbCred);
        if (!includeSecret) {
          delete (unified as any).secret;
        }
        return unified;
      }
    } catch (error) {
      // Not found in Database credentials
    }

    throw new NotFoundException(`Credential with ID "${id}" not found`);
  }

  async update(id: string, updateCredentialDto: UpdateCredentialDto) {
    // Determine which service to update based on existing credential
    const existing = await this.findOne(id);

    if (this.isGitService(existing.service)) {
      return this.gitCredentialsService.update(id, {
        name: updateCredentialDto.name,
        description: updateCredentialDto.description,
        token: updateCredentialDto.secret,
        metadata: updateCredentialDto.metadata,
        isDefault: updateCredentialDto.isDefault,
      });
    }

    if (existing.service === 'jira') {
      const updated = await this.jiraAccountService.update(id, {
        accountName: updateCredentialDto.name,
        email: updateCredentialDto.metadata?.username,
        jiraUrl: updateCredentialDto.metadata?.endpoint,
        apiToken: updateCredentialDto.secret,
      });
      return this.mapJiraAccountToUnified(updated);
    }

    if (this.isDatabaseService(existing.service)) {
      return this.databaseCredentialService.update(id, {
        name: updateCredentialDto.name,
        description: updateCredentialDto.description,
        password: updateCredentialDto.secret,
      });
    }

    // Update generic credential in Git credentials
    return this.gitCredentialsService.update(id, {
      name: updateCredentialDto.name,
      description: updateCredentialDto.description,
      token: updateCredentialDto.secret,
      metadata: updateCredentialDto.metadata,
    });
  }

  async remove(id: string) {
    const existing = await this.findOne(id);

    if (existing.service === 'jira') {
      return this.jiraAccountService.remove(id);
    }

    if (this.isGitService(existing.service) || this.isApiService(existing.service)) {
      return this.gitCredentialsService.remove(id);
    }

    if (this.isDatabaseService(existing.service)) {
      return this.databaseCredentialService.remove(id);
    }
  }

  async validateCredential(id: string) {
    const credential = await this.findOne(id);

    if (this.isGitService(credential.service)) {
      const isValid = await this.gitCredentialsService.validateCredential(id);
      return { valid: isValid, message: isValid ? 'Valid' : 'Invalid' };
    }

    if (credential.service === 'jira') {
      // For Jira, we could test the API connection
      // For now, just mark as valid
      return { valid: true, message: 'Jira credential validation will test API connection' };
    }

    if (this.isDatabaseService(credential.service)) {
      // For database credentials, we'll just mark as valid for now
      // TODO: Implement actual database connection testing
      return { valid: true, message: 'Database credential validation not yet implemented' };
    }

    // For other services, return a generic response
    return { valid: true, message: 'Validation not implemented for this service type' };
  }

  async rotateSecret(id: string, newSecret: string) {
    const credential = await this.findOne(id);

    if (this.isGitService(credential.service)) {
      return this.gitCredentialsService.rotateToken(id, newSecret);
    }

    // For other services, just update the secret
    return this.update(id, { secret: newSecret });
  }

  async testCredential(createCredentialDto: CreateCredentialDto) {
    // Implement test logic based on service type
    return { valid: true, message: 'Test credential functionality' };
  }

  async bulkValidate(ids: string[]) {
    const results: Record<string, { valid: boolean; message?: string }> = {};

    for (const id of ids) {
      try {
        results[id] = await this.validateCredential(id);
      } catch (error) {
        results[id] = { valid: false, message: error.message };
      }
    }

    return results;
  }

  async getUsageStats(id: string) {
    // This would track usage across all services
    return {
      totalUsage: 0,
      recentUsage: [],
    };
  }

  // Helper methods for mapping between different credential formats
  private mapGitCredentialToUnified(gitCred: any) {
    return {
      id: gitCred.id,
      name: gitCred.name,
      service: gitCred.provider,
      type: this.mapFromGitCredentialType(gitCred.type),
      projectId: gitCred.projectId,
      description: gitCred.description,
      metadata: {
        username: gitCred.username,
        endpoint: gitCred.baseUrl,
        ...gitCred.metadata,
      },
      status: gitCred.isActive ? 'active' : 'inactive',
      isDefault: gitCred.isDefault,
      expiresAt: gitCred.expiresAt,
      lastUsedAt: gitCred.lastUsedAt,
      lastValidatedAt: gitCred.lastValidatedAt,
      usageCount: 0, // Would need to track this
      createdAt: gitCred.createdAt,
      updatedAt: gitCred.updatedAt,
    };
  }

  private mapJiraAccountToUnified(jiraAccount: any) {
    return {
      id: jiraAccount.id,
      name: jiraAccount.accountName,
      service: 'jira',
      type: 'api_key',
      projectId: jiraAccount.projectId,
      description: `Jira account for ${jiraAccount.jiraUrl}`,
      metadata: {
        username: jiraAccount.email,
        endpoint: jiraAccount.jiraUrl,
        cloudId: jiraAccount.cloudId,
        accountType: jiraAccount.accountType,
      },
      status: jiraAccount.isActive ? 'active' : 'inactive',
      isDefault: false,
      expiresAt: null,
      lastUsedAt: jiraAccount.lastSyncedAt,
      lastValidatedAt: jiraAccount.lastSyncedAt,
      usageCount: 0,
      createdAt: jiraAccount.createdAt,
      updatedAt: jiraAccount.updatedAt,
    };
  }

  private mapDatabaseCredentialToUnified(dbCred: any) {
    return {
      id: dbCred.id,
      name: dbCred.name,
      service: dbCred.dbType,
      type: 'basic_auth',
      projectId: dbCred.projectId,
      description: dbCred.description,
      metadata: {
        username: dbCred.username,
        endpoint: `${dbCred.host}:${dbCred.port}`,
        database: dbCred.database,
        environment: dbCred.environment,
      },
      status: dbCred.isActive ? 'active' : 'inactive',
      isDefault: false,
      expiresAt: null,
      lastUsedAt: dbCred.lastConnectionTest,
      lastValidatedAt: dbCred.lastConnectionTest,
      usageCount: 0,
      createdAt: dbCred.createdAt,
      updatedAt: dbCred.updatedAt,
    };
  }

  private mapToGitCredentialType(type: string) {
    const typeMap = {
      'ssh_key': 'ssh_key',
      'pat': 'personal_access_token',
      'api_key': 'api_key',
      'oauth': 'oauth_token',
      'basic_auth': 'username_password',
      'bearer_token': 'personal_access_token',
    };
    return typeMap[type] || 'api_key';
  }

  private mapFromGitCredentialType(type: string) {
    const typeMap = {
      'ssh_key': 'ssh_key',
      'personal_access_token': 'pat',
      'api_key': 'api_key',
      'oauth_token': 'oauth',
      'username_password': 'basic_auth',
    };
    return typeMap[type] || 'api_key';
  }

  private getDefaultPort(service: string): number {
    const ports = {
      postgresql: 5432,
      mysql: 3306,
      mongodb: 27017,
      redis: 6379,
    };
    return ports[service] || 5432;
  }

  private mapToDatabaseType(service: string): string {
    const typeMap = {
      postgresql: 'postgresql',
      mysql: 'mysql',
      mongodb: 'mongodb',
      redis: 'redis',
    };
    return typeMap[service] || 'postgresql';
  }
}