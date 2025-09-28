import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GitCredential } from '../entities/git-credential.entity';
import { GitProvider } from '../entities/git-repository.entity';
import { EncryptionService } from '../../common/services/encryption.service';
import { GitLabProvider } from '../providers/gitlab.provider';
import { GitHubProvider } from '../providers/github.provider';
import { Project } from '../../projects/project.entity';
import { CreateGitCredentialDto } from '../dto/create-git-credential.dto';
import { UpdateGitCredentialDto } from '../dto/update-git-credential.dto';
import { IGitProvider } from '../interfaces/git-provider.interface';
import { HttpService } from '@nestjs/axios';
import * as crypto from 'crypto';

interface SSHKeyPair {
  privateKey: string;
  publicKey: string;
}

@Injectable()
export class GitCredentialsService {
  private readonly providers = new Map<string, IGitProvider>();

  constructor(
    @InjectRepository(GitCredential)
    private readonly credentialRepository: Repository<GitCredential>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly encryptionService: EncryptionService,
    private readonly httpService: HttpService
  ) {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    this.providers.set('github', new GitHubProvider(this.httpService));
    this.providers.set('gitlab', new GitLabProvider(this.httpService));
  }

  async create(createDto: CreateGitCredentialDto): Promise<GitCredential> {
    // Check for existing credential with the same name and provider in the same scope
    const whereCondition: any = {
      name: createDto.name,
      provider: createDto.provider
    };

    if (createDto.projectId) {
      whereCondition.projectId = createDto.projectId;
    } else {
      whereCondition.projectId = null;
    }

    const existing = await this.credentialRepository.findOne({
      where: whereCondition,
    });

    if (existing) {
      const scope = createDto.projectId ? `project "${createDto.projectId}"` : 'global scope';
      throw new ConflictException(
        `Credential with name "${createDto.name}" for provider "${createDto.provider}" already exists in ${scope}`
      );
    }

    // Verify project exists if projectId is provided
    if (createDto.projectId) {
      const project = await this.projectRepository.findOne({
        where: { id: createDto.projectId },
      });

      if (!project) {
        throw new NotFoundException(`Project with ID "${createDto.projectId}" not found`);
      }
    }

    // Create credential with encrypted sensitive data
    const credential = this.credentialRepository.create({
      ...createDto,
      encryptedToken: createDto.token
        ? this.encryptionService.encrypt(createDto.token)
        : undefined,
      encryptedPassword: createDto.password
        ? this.encryptionService.encrypt(createDto.password)
        : undefined,
      encryptedPrivateKey: createDto.privateKey
        ? this.encryptionService.encrypt(createDto.privateKey)
        : undefined,
    });

    // If this is set as default, unset other defaults for the same provider and scope
    if (createDto.isDefault) {
      const updateCondition: any = {
        provider: createDto.provider,
        isDefault: true
      };

      if (createDto.projectId) {
        updateCondition.projectId = createDto.projectId;
      } else {
        updateCondition.projectId = null;
      }

      await this.credentialRepository.update(updateCondition, { isDefault: false });
    }

    return await this.credentialRepository.save(credential);
  }

  async findAll(provider?: GitProvider, projectId?: string): Promise<GitCredential[]> {
    const where: any = {};

    if (provider) {
      where.provider = provider;
    }

    if (projectId) {
      where.projectId = projectId;
    }

    return await this.credentialRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<GitCredential> {
    const credential = await this.credentialRepository.findOne({
      where: { id },
      relations: ['repositories'],
    });

    if (!credential) {
      throw new NotFoundException(`Git credential with ID "${id}" not found`);
    }

    return credential;
  }

  async findByName(name: string, provider: GitProvider): Promise<GitCredential> {
    const credential = await this.credentialRepository.findOne({
      where: { name, provider },
    });

    if (!credential) {
      throw new NotFoundException(
        `Git credential "${name}" for provider "${provider}" not found`
      );
    }

    return credential;
  }

  async findDefault(provider: GitProvider, projectId?: string): Promise<GitCredential | null> {
    // First try to find project-specific default
    if (projectId) {
      const projectDefault = await this.credentialRepository.findOne({
        where: {
          provider,
          isDefault: true,
          isActive: true,
          projectId
        },
      });

      if (projectDefault) {
        return projectDefault;
      }
    }

    // Fall back to global default
    const nullCondition = {
      provider,
      isDefault: true,
      isActive: true
    };

    return await this.credentialRepository.findOne({
      where: nullCondition,
    });
  }

  async findByProject(projectId: string, provider?: GitProvider): Promise<GitCredential[]> {
    const where: any = {
      projectId
    };

    if (provider) {
      where.provider = provider;
    }

    return await this.credentialRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findAvailableForProject(projectId: string, provider?: GitProvider): Promise<GitCredential[]> {
    const where: any[] = [
      { projectId, isActive: true },
      { projectId: null, isActive: true }
    ];

    if (provider) {
      where.forEach(condition => {
        condition.provider = provider;
      });
    }

    return await this.credentialRepository.find({
      where,
      order: {
        projectId: 'DESC', // Project-specific credentials first
        createdAt: 'DESC'
      },
    });
  }

  async update(id: string, updateDto: UpdateGitCredentialDto): Promise<GitCredential> {
    const credential = await this.findOne(id);

    // Check for name conflicts
    if (updateDto.name && updateDto.name !== credential.name) {
      const existing = await this.credentialRepository.findOne({
        where: { name: updateDto.name, provider: credential.provider },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Credential with name "${updateDto.name}" for provider "${credential.provider}" already exists`
        );
      }
    }

    // Prepare update object with encrypted sensitive data
    const updates: any = { ...updateDto };

    if (updateDto.token) {
      updates.encryptedToken = this.encryptionService.encrypt(updateDto.token);
      delete updates.token;
    }

    if (updateDto.password) {
      updates.encryptedPassword = this.encryptionService.encrypt(updateDto.password);
      delete updates.password;
    }

    if (updateDto.privateKey) {
      updates.encryptedPrivateKey = this.encryptionService.encrypt(updateDto.privateKey);
      delete updates.privateKey;
    }

    // Handle default flag
    if (updateDto.isDefault) {
      await this.credentialRepository.update(
        { provider: credential.provider, isDefault: true },
        { isDefault: false }
      );
    }

    Object.assign(credential, updates);
    return await this.credentialRepository.save(credential);
  }

  async remove(id: string): Promise<void> {
    const credential = await this.findOne(id);

    // Check if credential is being used by repositories
    if (credential.repositories && credential.repositories.length > 0) {
      throw new BadRequestException(
        `Cannot delete credential "${credential.name}" as it is being used by ${credential.repositories.length} repositories`
      );
    }

    await this.credentialRepository.remove(credential);
  }

  async getDecryptedCredential(id: string): Promise<GitCredential> {
    const credential = await this.credentialRepository.findOne({
      where: { id },
      select: [
        'id',
        'name',
        'type',
        'provider',
        'baseUrl',
        'username',
        'encryptedToken',
        'encryptedPassword',
        'encryptedPrivateKey',
        'publicKey',
        'scopes',
        'metadata',
        'isActive',
      ],
    });

    if (!credential) {
      throw new NotFoundException(`Git credential with ID "${id}" not found`);
    }

    // Create result object and decrypt sensitive fields
    const result: any = { ...credential };

    if (credential.encryptedToken) {
      result.token = this.encryptionService.decrypt(credential.encryptedToken);
      // For compatibility, also set encryptedToken to the decrypted value
      result.encryptedToken = result.token;
    }

    if (credential.encryptedPassword) {
      result.password = this.encryptionService.decrypt(credential.encryptedPassword);
      delete result.encryptedPassword;
    }

    if (credential.encryptedPrivateKey) {
      result.privateKey = this.encryptionService.decrypt(credential.encryptedPrivateKey);
      delete result.encryptedPrivateKey;
    }

    return result;
  }

  async validateCredential(id: string): Promise<boolean> {
    const credential = await this.getDecryptedCredential(id);

    if (!credential.isActive) {
      return false;
    }

    // Check if credential has expired
    if (credential.expiresAt && credential.expiresAt < new Date()) {
      await this.credentialRepository.update(id, { isActive: false });
      return false;
    }

    // Get provider for validation
    const provider = this.providers.get(credential.provider.toLowerCase());
    if (!provider) {
      // If no provider available, just mark as validated
      await this.credentialRepository.update(id, { lastValidatedAt: new Date() });
      return true;
    }

    try {
      const isValid = await provider.validateCredential(credential);

      if (isValid) {
        await this.credentialRepository.update(id, {
          lastValidatedAt: new Date(),
          isActive: true
        });
      } else {
        await this.credentialRepository.update(id, {
          isActive: false
        });
      }

      return isValid;
    } catch (error) {
      // Mark as inactive on validation error
      await this.credentialRepository.update(id, { isActive: false });
      return false;
    }
  }

  async markAsUsed(id: string): Promise<void> {
    await this.credentialRepository.update(id, { lastUsedAt: new Date() });
  }

  async rotateToken(id: string, newToken: string): Promise<GitCredential> {
    const credential = await this.findOne(id);

    credential.encryptedToken = this.encryptionService.encrypt(newToken);
    credential.lastValidatedAt = new Date();

    return await this.credentialRepository.save(credential);
  }

  async generateSSHKeyPair(name: string, provider: GitProvider, email?: string): Promise<SSHKeyPair> {
    const { generateKeyPairSync } = crypto;

    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    const sshPublicKey = this.convertToSSHFormat(publicKey, email || `${name}@automation`);

    return {
      privateKey,
      publicKey: sshPublicKey,
    };
  }

  private convertToSSHFormat(pemPublicKey: string, comment: string): string {
    // Remove PEM headers and whitespace
    const publicKeyBase64 = pemPublicKey
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\s/g, '');

    const publicKeyBuffer = Buffer.from(publicKeyBase64, 'base64');

    // SSH RSA prefix
    const sshRsaPrefix = Buffer.from([
      0x00, 0x00, 0x00, 0x07, 0x73, 0x73, 0x68, 0x2d, 0x72, 0x73, 0x61,
    ]);

    // Extract the DER sequence (this is simplified, actual implementation may need more parsing)
    const derSequence = publicKeyBuffer.slice(
      publicKeyBuffer.indexOf(Buffer.from([0x00, 0x01]))
    );

    const sshPublicKeyBuffer = Buffer.concat([sshRsaPrefix, derSequence]);
    const sshPublicKeyBase64 = sshPublicKeyBuffer.toString('base64');

    return `ssh-rsa ${sshPublicKeyBase64} ${comment}`;
  }
}