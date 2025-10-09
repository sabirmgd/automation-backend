import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GitRepository, GitProvider } from '../entities/git-repository.entity';
import { Project } from '../../projects/project.entity';
import { CreateGitRepositoryDto } from '../dto/create-git-repository.dto';
import { UpdateGitRepositoryDto } from '../dto/update-git-repository.dto';
import { GitCredentialsService } from './git-credentials.service';
import { IGitProvider, CreateRepositoryOptions, CloneOptions as ICloneOptions } from '../interfaces/git-provider.interface';
import { GitLabProvider } from '../providers/gitlab.provider';
import { GitHubProvider } from '../providers/github.provider';
import { HttpService } from '@nestjs/axios';

export interface SyncRepositoriesResult {
  repositories: GitRepository[];
  syncedAt: Date;
  credentialsUsed: string[];
  errors: Array<{ credential: string; error: string }>;
  totalRepositories: number;
  successCount: number;
  failureCount: number;
}


@Injectable()
export class GitService {
  private readonly providers = new Map<GitProvider, IGitProvider>();

  constructor(
    @InjectRepository(GitRepository)
    private readonly gitRepository: Repository<GitRepository>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly credentialsService: GitCredentialsService,
    private readonly httpService: HttpService
  ) {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    this.providers.set(GitProvider.GITHUB, new GitHubProvider(this.httpService));
    this.providers.set(GitProvider.GITLAB, new GitLabProvider(this.httpService));
  }

  private getProvider(providerType: GitProvider): IGitProvider {
    const provider = this.providers.get(providerType);
    if (!provider) {
      throw new BadRequestException(`Unsupported Git provider: ${providerType}`);
    }
    return provider;
  }

  async createRepository(createDto: CreateGitRepositoryDto): Promise<GitRepository> {
    const project = await this.projectRepository.findOne({
      where: { id: createDto.projectId },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID "${createDto.projectId}" not found`);
    }

    const repository = this.gitRepository.create({
      ...createDto,
      project,
    });

    return await this.gitRepository.save(repository);
  }

  async createRemoteRepository(
    projectId: string,
    provider: GitProvider,
    options: CreateRepositoryOptions,
    credentialId?: string
  ): Promise<GitRepository> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID "${projectId}" not found`);
    }

    let credential;
    if (credentialId) {
      credential = await this.credentialsService.getDecryptedCredential(credentialId);
    } else {
      const defaultCred = await this.credentialsService.findDefault(provider, projectId);
      if (!defaultCred) {
        throw new BadRequestException(
          `No default credential found for provider "${provider}" for this project`
        );
      }
      credential = await this.credentialsService.getDecryptedCredential(defaultCred.id);
    }

    const gitProvider = this.getProvider(provider);
    const remoteRepo = await gitProvider.createRepository(options, credential);

    remoteRepo.projectId = projectId;
    remoteRepo.project = project;
    remoteRepo.credentialId = credential.id;

    return await this.gitRepository.save(remoteRepo);
  }

  async importRepository(
    projectId: string,
    provider: GitProvider,
    owner: string,
    repoName: string,
    credentialId?: string
  ): Promise<GitRepository> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID "${projectId}" not found`);
    }

    let credential;
    if (credentialId) {
      credential = await this.credentialsService.getDecryptedCredential(credentialId);
    } else {
      const defaultCred = await this.credentialsService.findDefault(provider, projectId);
      if (!defaultCred) {
        throw new BadRequestException(
          `No default credential found for provider "${provider}" for this project`
        );
      }
      credential = await this.credentialsService.getDecryptedCredential(defaultCred.id);
    }

    const gitProvider = this.getProvider(provider);

    // Auto-detect owner if not provided or empty
    if (!owner || owner.trim() === '') {
      console.log('[GitService] No owner provided, auto-detecting from credentials...');
      const userInfo = await gitProvider.getUserInfo(credential);
      owner = userInfo.username;
      console.log(`[GitService] Auto-detected owner: ${owner}`);
    }

    const remoteRepo = await gitProvider.getRepository(owner, repoName, credential);

    // Check if repository is already imported
    const existing = await this.gitRepository.findOne({
      where: {
        projectId: projectId,
        remoteId: remoteRepo.remoteId,
        provider: provider,
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Repository "${owner}/${repoName}" is already imported for this project`
      );
    }

    remoteRepo.projectId = projectId;
    remoteRepo.project = project;
    remoteRepo.credentialId = credential.id;

    return await this.gitRepository.save(remoteRepo);
  }

  async findAll(projectId?: string, provider?: GitProvider): Promise<GitRepository[]> {
    const where: any = {};
    if (projectId) where.projectId = projectId;
    if (provider) where.provider = provider;

    return await this.gitRepository.find({
      where,
      relations: ['project', 'credential'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<GitRepository> {
    const repository = await this.gitRepository.findOne({
      where: { id },
      relations: ['project', 'credential'],
    });

    if (!repository) {
      throw new NotFoundException(`Git repository with ID "${id}" not found`);
    }

    return repository;
  }

  async findByProject(projectId: string): Promise<GitRepository[]> {
    return await this.gitRepository.find({
      where: { projectId },
      relations: ['credential'],
      order: { createdAt: 'DESC' },
    });
  }

  async update(id: string, updateDto: UpdateGitRepositoryDto): Promise<GitRepository> {
    const repository = await this.findOne(id);

    if (updateDto.projectId && updateDto.projectId !== repository.projectId) {
      const project = await this.projectRepository.findOne({
        where: { id: updateDto.projectId },
      });

      if (!project) {
        throw new NotFoundException(`Project with ID "${updateDto.projectId}" not found`);
      }

      repository.project = project;
    }

    Object.assign(repository, updateDto);
    return await this.gitRepository.save(repository);
  }

  async remove(id: string): Promise<void> {
    const repository = await this.findOne(id);
    await this.gitRepository.remove(repository);
  }

  async cloneRepository(id: string, localPath: string, options?: Partial<ICloneOptions>): Promise<void> {
    const repository = await this.findOne(id);

    if (!repository.credentialId) {
      throw new BadRequestException(
        `No credential configured for repository "${repository.name}"`
      );
    }

    const credential = await this.credentialsService.getDecryptedCredential(
      repository.credentialId
    );
    repository.credential = credential;

    const gitProvider = this.getProvider(repository.provider);

    const cloneOptions = {
      localPath,
      branch: options?.branch || repository.defaultBranch,
      depth: options?.depth,
      recursive: options?.recursive,
    };

    await gitProvider.cloneRepository(repository, cloneOptions);

    // Update repository with local path
    repository.localPath = localPath;
    await this.gitRepository.save(repository);

    await this.credentialsService.markAsUsed(credential.id);
  }

  async syncRepository(id: string): Promise<GitRepository> {
    const repository = await this.findOne(id);

    if (!repository.credentialId) {
      throw new BadRequestException(
        `No credential configured for repository "${repository.name}"`
      );
    }

    const credential = await this.credentialsService.getDecryptedCredential(
      repository.credentialId
    );
    const gitProvider = this.getProvider(repository.provider);

    // For the sync, we need to extract owner and repo name from the remote ID
    const [owner, repoName] = repository.remoteId.split('/');
    const updatedRepo = await gitProvider.getRepository(owner, repoName, credential);

    // Update repository with latest remote data
    repository.description = updatedRepo.description;
    repository.defaultBranch = updatedRepo.defaultBranch;
    repository.visibility = updatedRepo.visibility;
    repository.namespace = updatedRepo.namespace;  // Ensure namespace is synced
    repository.metadata = updatedRepo.metadata;
    repository.lastSyncedAt = new Date();

    await this.credentialsService.markAsUsed(credential.id);
    return await this.gitRepository.save(repository);
  }

  async syncProjectRepositories(projectId: string): Promise<SyncRepositoriesResult> {
    console.log(`[GitService] Starting sync for project: ${projectId}`);

    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      console.error(`[GitService] Project not found: ${projectId}`);
      throw new NotFoundException(`Project with ID "${projectId}" not found`);
    }

    console.log(`[GitService] Found project: ${project.name}`);

    const credentials = await this.credentialsService.findByProject(projectId);
    console.log(`[GitService] Found ${credentials.length} credentials for project`);

    const repositories: GitRepository[] = [];
    const credentialsUsed: string[] = [];
    const errors: Array<{ credential: string; error: string }> = [];

    for (const credential of credentials) {
      try {
        console.log(
          `[GitService] Processing credential: ${credential.name} (${credential.provider})`
        );

        const decryptedCredential = await this.credentialsService.getDecryptedCredential(
          credential.id
        );

        console.log(
          `[GitService] Credential decrypted, has encryptedToken: ${!!decryptedCredential.encryptedToken}, token starts with: ${decryptedCredential.encryptedToken?.substring(
            0,
            10
          )}...`
        );

        const provider = this.getProvider(credential.provider as GitProvider);
        const remoteRepos = await provider.listRepositories(decryptedCredential);

        console.log(
          `[GitService] Found ${remoteRepos.length} repositories from ${credential.provider}`
        );

        for (const remoteRepo of remoteRepos) {
          let existingRepo = await this.gitRepository.findOne({
            where: {
              projectId,
              provider: remoteRepo.provider,
              remoteId: remoteRepo.remoteId,
            },
          });

          if (existingRepo) {
            console.log(`[GitService] Updating existing repo: ${existingRepo.name}`);
            // Update existing repository
            existingRepo.name = remoteRepo.name;
            existingRepo.description = remoteRepo.description;
            existingRepo.url = remoteRepo.url;
            existingRepo.cloneUrl = remoteRepo.cloneUrl;
            existingRepo.sshUrl = remoteRepo.sshUrl;
            existingRepo.defaultBranch = remoteRepo.defaultBranch;
            existingRepo.visibility = remoteRepo.visibility;
            existingRepo.metadata = remoteRepo.metadata;
            existingRepo.lastSyncedAt = new Date();
            existingRepo.credentialId = credential.id;

            repositories.push(await this.gitRepository.save(existingRepo));
          } else {
            console.log(`[GitService] Creating new repo: ${remoteRepo.name}`);
            // Create new repository
            const newRepo = this.gitRepository.create({
              ...remoteRepo,
              projectId,
              project,
              credentialId: credential.id,
              credential,
              lastSyncedAt: new Date(),
            });

            const savedRepo = await this.gitRepository.save(newRepo);
            repositories.push(savedRepo);
          }
        }

        credentialsUsed.push(credential.name);
        await this.credentialsService.markAsUsed(credential.id);
      } catch (error: any) {
        console.error(`[GitService] Error with credential ${credential.name}:`, error.message);
        errors.push({
          credential: credential.name,
          error: error.message || 'Unknown error occurred',
        });
      }
    }

    console.log(
      `[GitService] Sync completed - Repos: ${repositories.length}, Creds used: ${credentialsUsed.length}, Errors: ${errors.length}`
    );

    return {
      repositories,
      syncedAt: new Date(),
      credentialsUsed,
      errors,
      totalRepositories: repositories.length,
      successCount: credentialsUsed.length,
      failureCount: errors.length,
    };
  }

  async pullChanges(id: string, branch?: string): Promise<void> {
    const repository = await this.findOne(id);

    if (!repository.localPath) {
      throw new BadRequestException(
        `Repository "${repository.name}" has not been cloned locally`
      );
    }

    if (!repository.credentialId) {
      throw new BadRequestException(
        `No credential configured for repository "${repository.name}"`
      );
    }

    const credential = await this.credentialsService.getDecryptedCredential(
      repository.credentialId
    );
    repository.credential = credential;

    const gitProvider = this.getProvider(repository.provider);
    await gitProvider.pullChanges(repository, branch);

    await this.credentialsService.markAsUsed(credential.id);
  }

  async pushChanges(id: string, branch?: string, message?: string): Promise<void> {
    const repository = await this.findOne(id);

    if (!repository.localPath) {
      throw new BadRequestException(
        `Repository "${repository.name}" has not been cloned locally`
      );
    }

    if (!repository.credentialId) {
      throw new BadRequestException(
        `No credential configured for repository "${repository.name}"`
      );
    }

    const credential = await this.credentialsService.getDecryptedCredential(
      repository.credentialId
    );
    repository.credential = credential;

    const gitProvider = this.getProvider(repository.provider);
    await gitProvider.pushChanges(repository, branch, message);

    await this.credentialsService.markAsUsed(credential.id);
  }

  async getBranches(id: string): Promise<any[]> {
    const repository = await this.findOne(id);

    if (!repository.credentialId) {
      throw new BadRequestException(
        `No credential configured for repository "${repository.name}"`
      );
    }

    const credential = await this.credentialsService.getDecryptedCredential(
      repository.credentialId
    );
    const gitProvider = this.getProvider(repository.provider);

    const branches = await gitProvider.getBranches(repository, credential);
    await this.credentialsService.markAsUsed(credential.id);

    return branches;
  }

  async getCommits(id: string, branch?: string, limit?: number): Promise<any[]> {
    const repository = await this.findOne(id);

    if (!repository.credentialId) {
      throw new BadRequestException(
        `No credential configured for repository "${repository.name}"`
      );
    }

    const credential = await this.credentialsService.getDecryptedCredential(
      repository.credentialId
    );
    const gitProvider = this.getProvider(repository.provider);

    const commits = await gitProvider.getCommits(repository, credential, branch, limit);
    await this.credentialsService.markAsUsed(credential.id);

    return commits;
  }

  async getPullRequests(id: string, state?: string): Promise<any[]> {
    const repository = await this.findOne(id);

    if (!repository.credentialId) {
      throw new BadRequestException(
        `No credential configured for repository "${repository.name}"`
      );
    }

    const credential = await this.credentialsService.getDecryptedCredential(
      repository.credentialId
    );
    const gitProvider = this.getProvider(repository.provider);

    const pullRequests = await gitProvider.listPullRequests(repository, credential, state);
    await this.credentialsService.markAsUsed(credential.id);

    return pullRequests;
  }

  async getIssues(id: string, state?: string, labels?: string[]): Promise<any[]> {
    const repository = await this.findOne(id);

    if (!repository.credentialId) {
      throw new BadRequestException(
        `No credential configured for repository "${repository.name}"`
      );
    }

    const credential = await this.credentialsService.getDecryptedCredential(
      repository.credentialId
    );
    const gitProvider = this.getProvider(repository.provider);

    const issues = await gitProvider.listIssues(repository, credential, state, labels);
    await this.credentialsService.markAsUsed(credential.id);

    return issues;
  }

  async searchRepositories(
    provider: GitProvider,
    query: string,
    credentialId?: string,
    limit?: number
  ): Promise<GitRepository[]> {
    let credential;

    if (credentialId) {
      credential = await this.credentialsService.getDecryptedCredential(credentialId);
    } else {
      const defaultCred = await this.credentialsService.findDefault(provider);
      if (!defaultCred) {
        throw new BadRequestException(`No default credential found for provider "${provider}"`);
      }
      credential = await this.credentialsService.getDecryptedCredential(defaultCred.id);
    }

    const gitProvider = this.getProvider(provider);
    const repositories = await gitProvider.searchRepositories(query, credential, limit);

    await this.credentialsService.markAsUsed(credential.id);
    return repositories;
  }

  async getRepositoriesByCredential(credentialId: string): Promise<GitRepository[]> {
    return await this.gitRepository.find({
      where: { credentialId },
      relations: ['project'],
      order: { createdAt: 'DESC' },
    });
  }
}