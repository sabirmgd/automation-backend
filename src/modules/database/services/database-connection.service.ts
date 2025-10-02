import { Injectable, Logger } from '@nestjs/common';
import { TestConnectionDto } from '../dto';
import { DatabaseCredential, DatabaseType } from '../entities/database-credential.entity';
import { EncryptionService } from '../../../common/services/encryption.service';
import { DatabaseCredentialService } from './database-credential.service';
import * as mysql from 'mysql2/promise';
import { Client as PgClient } from 'pg';
import { MongoClient } from 'mongodb';
import Redis from 'ioredis';
import * as tedious from 'tedious';
import * as sqlite3 from 'sqlite3';

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: {
    version?: string;
    serverInfo?: any;
    latency?: number;
    [key: string]: any;
  };
  error?: string;
}

@Injectable()
export class DatabaseConnectionService {
  private readonly logger = new Logger(DatabaseConnectionService.name);

  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly credentialService: DatabaseCredentialService,
  ) {}

  async testConnection(dto: TestConnectionDto): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    try {
      let result: ConnectionTestResult;

      switch (dto.dbType) {
        case DatabaseType.MYSQL:
          result = await this.testMySqlConnection(dto);
          break;
        case DatabaseType.POSTGRESQL:
          result = await this.testPostgreSqlConnection(dto);
          break;
        case DatabaseType.MONGODB:
          result = await this.testMongoDbConnection(dto);
          break;
        case DatabaseType.REDIS:
          result = await this.testRedisConnection(dto);
          break;
        case DatabaseType.MSSQL:
          result = await this.testMsSqlConnection(dto);
          break;
        case DatabaseType.SQLITE:
          result = await this.testSqliteConnection(dto);
          break;
        default:
          result = {
            success: false,
            message: `Database type ${dto.dbType} is not yet supported`,
          };
      }

      if (result.success && result.details) {
        result.details.latency = Date.now() - startTime;
      }

      return result;
    } catch (error) {
      this.logger.error(`Connection test failed: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Connection test failed',
        error: error.message,
      };
    }
  }

  async testCredentialConnection(credentialId: string): Promise<ConnectionTestResult> {
    const credential = await this.credentialService.findOneWithPassword(credentialId);

    const testDto: TestConnectionDto = {
      dbType: credential.dbType,
      host: credential.host,
      port: credential.port,
      database: credential.database,
      username: credential.username,
      password: credential.password,
      sslConfig: credential.sslConfig,
      connectionOptions: credential.connectionOptions,
    };

    const result = await this.testConnection(testDto);

    await this.credentialService.updateConnectionStatus(
      credentialId,
      result.success,
      result.error,
    );

    return result;
  }

  private async testMySqlConnection(dto: TestConnectionDto): Promise<ConnectionTestResult> {
    let connection;

    try {
      const config: any = {
        host: dto.host,
        port: dto.port,
        user: dto.username,
        password: dto.password,
        database: dto.database,
        connectTimeout: dto.connectionOptions?.connectionTimeout || 10000,
      };

      if (dto.sslConfig?.enabled) {
        config.ssl = {
          ca: dto.sslConfig.ca,
          cert: dto.sslConfig.cert,
          key: dto.sslConfig.key,
          rejectUnauthorized: dto.sslConfig.rejectUnauthorized,
        };
      }

      connection = await mysql.createConnection(config);
      const [rows]: any = await connection.execute('SELECT VERSION() as version');

      await connection.end();

      return {
        success: true,
        message: 'MySQL connection successful',
        details: {
          version: rows[0].version,
        },
      };
    } catch (error) {
      if (connection) {
        try {
          await connection.end();
        } catch (e) {}
      }
      throw error;
    }
  }

  private async testPostgreSqlConnection(dto: TestConnectionDto): Promise<ConnectionTestResult> {
    const client = new PgClient({
      host: dto.host,
      port: dto.port,
      user: dto.username,
      password: dto.password,
      database: dto.database,
      connectionTimeoutMillis: dto.connectionOptions?.connectionTimeout || 10000,
      ssl: dto.sslConfig?.enabled ? {
        ca: dto.sslConfig.ca,
        cert: dto.sslConfig.cert,
        key: dto.sslConfig.key,
        rejectUnauthorized: dto.sslConfig.rejectUnauthorized,
      } : false,
    });

    try {
      await client.connect();
      const result = await client.query('SELECT version()');
      await client.end();

      return {
        success: true,
        message: 'PostgreSQL connection successful',
        details: {
          version: result.rows[0].version,
        },
      };
    } catch (error) {
      try {
        await client.end();
      } catch (e) {}
      throw error;
    }
  }

  private async testMongoDbConnection(dto: TestConnectionDto): Promise<ConnectionTestResult> {
    let client: MongoClient;

    try {
      const authString = dto.username && dto.password
        ? `${encodeURIComponent(dto.username)}:${encodeURIComponent(dto.password)}@`
        : '';

      const options: any = {
        serverSelectionTimeoutMS: dto.connectionOptions?.connectionTimeout || 10000,
      };

      if (dto.connectionOptions?.authSource) {
        options.authSource = dto.connectionOptions.authSource;
      }

      if (dto.sslConfig?.enabled) {
        options.tls = true;
        options.tlsCAFile = dto.sslConfig.ca;
        options.tlsCertificateFile = dto.sslConfig.cert;
        options.tlsCertificateKeyFile = dto.sslConfig.key;
        options.tlsAllowInvalidCertificates = !dto.sslConfig.rejectUnauthorized;
      }

      const url = `mongodb://${authString}${dto.host}:${dto.port}/${dto.database}`;
      client = new MongoClient(url, options);

      await client.connect();
      const adminDb = client.db().admin();
      const serverInfo = await adminDb.serverStatus();

      await client.close();

      return {
        success: true,
        message: 'MongoDB connection successful',
        details: {
          version: serverInfo.version,
          serverInfo: {
            host: serverInfo.host,
            uptime: serverInfo.uptime,
          },
        },
      };
    } catch (error) {
      if (client) {
        try {
          await client.close();
        } catch (e) {}
      }
      throw error;
    }
  }

  private async testRedisConnection(dto: TestConnectionDto): Promise<ConnectionTestResult> {
    return new Promise((resolve) => {
      const options: any = {
        host: dto.host,
        port: dto.port,
        password: dto.password,
        db: parseInt(dto.database) || 0,
        connectTimeout: dto.connectionOptions?.connectionTimeout || 10000,
        retryStrategy: () => null,
      };

      if (dto.sslConfig?.enabled) {
        options.tls = {
          ca: dto.sslConfig.ca,
          cert: dto.sslConfig.cert,
          key: dto.sslConfig.key,
          rejectUnauthorized: dto.sslConfig.rejectUnauthorized,
        };
      }

      const client = new Redis(options);

      client.once('connect', async () => {
        try {
          const info = await client.info('server');
          const versionMatch = info.match(/redis_version:([^\r\n]+)/);
          const version = versionMatch ? versionMatch[1] : 'unknown';

          await client.quit();

          resolve({
            success: true,
            message: 'Redis connection successful',
            details: {
              version,
            },
          });
        } catch (error) {
          client.disconnect();
          resolve({
            success: false,
            message: 'Redis connection failed',
            error: error.message,
          });
        }
      });

      client.once('error', (error) => {
        client.disconnect();
        resolve({
          success: false,
          message: 'Redis connection failed',
          error: error.message,
        });
      });
    });
  }

  private async testMsSqlConnection(dto: TestConnectionDto): Promise<ConnectionTestResult> {
    return new Promise((resolve) => {
      const config: any = {
        server: dto.host,
        authentication: {
          type: 'default',
          options: {
            userName: dto.username,
            password: dto.password,
          },
        },
        options: {
          port: dto.port,
          database: dto.database,
          encrypt: dto.sslConfig?.enabled || false,
          trustServerCertificate: !dto.sslConfig?.rejectUnauthorized,
          connectTimeout: dto.connectionOptions?.connectionTimeout || 10000,
        },
      };

      const connection = new tedious.Connection(config);

      connection.on('connect', (err) => {
        if (err) {
          resolve({
            success: false,
            message: 'MSSQL connection failed',
            error: err.message,
          });
        } else {
          const request = new tedious.Request(
            'SELECT @@VERSION as version',
            (error, rowCount, rows) => {
              connection.close();

              if (error) {
                resolve({
                  success: false,
                  message: 'MSSQL query failed',
                  error: error.message,
                });
              } else {
                const version = rows[0]?.[0]?.value || 'unknown';
                resolve({
                  success: true,
                  message: 'MSSQL connection successful',
                  details: {
                    version,
                  },
                });
              }
            },
          );

          connection.execSql(request);
        }
      });

      connection.connect();
    });
  }

  private async testSqliteConnection(dto: TestConnectionDto): Promise<ConnectionTestResult> {
    return new Promise((resolve) => {
      const db = new sqlite3.Database(dto.database, (err) => {
        if (err) {
          resolve({
            success: false,
            message: 'SQLite connection failed',
            error: err.message,
          });
        } else {
          db.get('SELECT sqlite_version() as version', (error, row: any) => {
            db.close();

            if (error) {
              resolve({
                success: false,
                message: 'SQLite query failed',
                error: error.message,
              });
            } else {
              resolve({
                success: true,
                message: 'SQLite connection successful',
                details: {
                  version: row.version,
                },
              });
            }
          });
        }
      });
    });
  }

  async getConnectionString(credentialId: string): Promise<string> {
    const credential = await this.credentialService.findOneWithPassword(credentialId);

    switch (credential.dbType) {
      case DatabaseType.MYSQL:
        return `mysql://${credential.username}:****@${credential.host}:${credential.port}/${credential.database}`;
      case DatabaseType.POSTGRESQL:
        return `postgresql://${credential.username}:****@${credential.host}:${credential.port}/${credential.database}`;
      case DatabaseType.MONGODB:
        return `mongodb://${credential.username}:****@${credential.host}:${credential.port}/${credential.database}`;
      case DatabaseType.REDIS:
        return `redis://:****@${credential.host}:${credential.port}/${credential.database}`;
      case DatabaseType.MSSQL:
        return `mssql://${credential.username}:****@${credential.host}:${credential.port}/${credential.database}`;
      case DatabaseType.SQLITE:
        return `sqlite://${credential.database}`;
      default:
        return 'Unknown database type';
    }
  }
}