import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseCredential, Environment } from '../entities/database-credential.entity';
import {
  CreateDatabaseCredentialDto,
  UpdateDatabaseCredentialDto,
} from '../dto';
import { EncryptionService } from '../../../common/services/encryption.service';

@Injectable()
export class DatabaseCredentialService {
  constructor(
    @InjectRepository(DatabaseCredential)
    private readonly databaseCredentialRepository: Repository<DatabaseCredential>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async create(dto: CreateDatabaseCredentialDto): Promise<DatabaseCredential> {
    const existing = await this.databaseCredentialRepository.findOne({
      where: {
        projectId: dto.projectId,
        environment: dto.environment,
        name: dto.name,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Database credential with name "${dto.name}" already exists for this project and environment`,
      );
    }

    const credential = this.databaseCredentialRepository.create({
      ...dto,
      encryptedPassword: this.encryptionService.encrypt(dto.password),
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });

    return await this.databaseCredentialRepository.save(credential);
  }

  async findAll(projectId?: string): Promise<DatabaseCredential[]> {
    const query = this.databaseCredentialRepository
      .createQueryBuilder('credential')
      .leftJoinAndSelect('credential.project', 'project');

    if (projectId) {
      query.where('credential.projectId = :projectId', { projectId });
    }

    return await query.orderBy('credential.environment', 'ASC')
      .addOrderBy('credential.name', 'ASC')
      .getMany();
  }

  async findByProject(projectId: string): Promise<DatabaseCredential[]> {
    return await this.databaseCredentialRepository.find({
      where: { projectId },
      relations: ['project'],
      order: {
        environment: 'ASC',
        name: 'ASC',
      },
    });
  }

  async findByEnvironment(
    projectId: string,
    environment: Environment,
  ): Promise<DatabaseCredential[]> {
    return await this.databaseCredentialRepository.find({
      where: {
        projectId,
        environment,
        isActive: true,
      },
      relations: ['project'],
      order: {
        name: 'ASC',
      },
    });
  }

  async findOne(id: string): Promise<DatabaseCredential> {
    const credential = await this.databaseCredentialRepository.findOne({
      where: { id },
      relations: ['project'],
    });

    if (!credential) {
      throw new NotFoundException(`Database credential with ID "${id}" not found`);
    }

    return credential;
  }

  async findOneWithPassword(id: string): Promise<DatabaseCredential & { password: string }> {
    const credential = await this.databaseCredentialRepository.findOne({
      where: { id },
      select: [
        'id', 'name', 'description', 'environment', 'dbType',
        'host', 'port', 'database', 'username', 'encryptedPassword',
        'sslConfig', 'connectionOptions', 'metadata', 'projectId',
        'isActive', 'createdAt', 'updatedAt'
      ],
      relations: ['project'],
    });

    if (!credential) {
      throw new NotFoundException(`Database credential with ID "${id}" not found`);
    }

    const password = this.encryptionService.decrypt(credential.encryptedPassword);

    return {
      ...credential,
      password,
    };
  }

  async update(
    id: string,
    dto: UpdateDatabaseCredentialDto,
  ): Promise<DatabaseCredential> {
    const credential = await this.findOne(id);

    if (dto.name || dto.environment) {
      const existing = await this.databaseCredentialRepository.findOne({
        where: {
          projectId: credential.projectId,
          environment: dto.environment || credential.environment,
          name: dto.name || credential.name,
          id: { not: id } as any,
        },
      });

      if (existing) {
        throw new ConflictException(
          'Database credential with this name already exists for this environment',
        );
      }
    }

    const updateData: any = { ...dto };

    if (dto.password) {
      updateData.encryptedPassword = this.encryptionService.encrypt(dto.password);
      delete updateData.password;
    }

    if (dto.updatedBy) {
      updateData.updatedBy = dto.updatedBy;
    }

    await this.databaseCredentialRepository.update(id, updateData);

    return await this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const credential = await this.findOne(id);
    await this.databaseCredentialRepository.remove(credential);
  }

  async updateConnectionStatus(
    id: string,
    status: boolean,
    error?: string,
  ): Promise<void> {
    await this.databaseCredentialRepository.update(id, {
      lastConnectionTest: new Date(),
      lastConnectionStatus: status,
      lastConnectionError: error || null,
    });
  }

  async toggleActive(id: string): Promise<DatabaseCredential> {
    const credential = await this.findOne(id);
    credential.isActive = !credential.isActive;
    return await this.databaseCredentialRepository.save(credential);
  }

  async cloneCredential(
    id: string,
    targetEnvironment: Environment,
    newName?: string,
  ): Promise<DatabaseCredential> {
    const source = await this.findOneWithPassword(id);

    const dto: CreateDatabaseCredentialDto = {
      name: newName || `${source.name} (Copy)`,
      description: source.description,
      environment: targetEnvironment,
      dbType: source.dbType,
      host: source.host,
      port: source.port,
      database: source.database,
      username: source.username,
      password: source.password,
      sslConfig: source.sslConfig,
      connectionOptions: source.connectionOptions,
      metadata: source.metadata,
      projectId: source.projectId,
      isActive: true,
    };

    return await this.create(dto);
  }

  async getStatistics(projectId?: string): Promise<any> {
    const query = this.databaseCredentialRepository
      .createQueryBuilder('credential');

    if (projectId) {
      query.where('credential.projectId = :projectId', { projectId });
    }

    const stats = await query
      .select('credential.environment', 'environment')
      .addSelect('credential.dbType', 'dbType')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(CASE WHEN credential.isActive = true THEN 1 ELSE 0 END)', 'active')
      .addSelect('SUM(CASE WHEN credential.lastConnectionStatus = true THEN 1 ELSE 0 END)', 'connected')
      .groupBy('credential.environment')
      .addGroupBy('credential.dbType')
      .getRawMany();

    return stats;
  }
}