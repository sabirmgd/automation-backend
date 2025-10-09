import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { GitService } from '../services/git.service';
import { CreateGitRepositoryDto as CreateRepositoryDto } from '../dto/create-git-repository.dto';
import { UpdateGitRepositoryDto as UpdateRepositoryDto } from '../dto/update-git-repository.dto';
import { GitProvider } from '../entities/git-repository.entity';
import { CreateRepositoryOptions } from '../interfaces/git-provider.interface';

interface CreateRemoteRequest {
  projectId: string;
  provider: GitProvider;
  options: CreateRepositoryOptions;
  credentialId?: string;
}

interface ImportRequest {
  projectId: string;
  provider: GitProvider;
  owner?: string;  // Now optional - will auto-detect from token if not provided
  repoName?: string;  // Optional if githubUrl is provided
  githubUrl?: string;  // Can provide full GitHub URL instead of owner/repoName
  credentialId?: string;
}

interface CloneRequest {
  localPath: string;
  options?: {
    branch?: string;
    depth?: number;
    recursive?: boolean;
  };
}

interface PullRequest {
  branch?: string;
}

interface PushRequest {
  branch?: string;
  message?: string;
}

@Controller('git/repositories')
export class GitController {
  constructor(private readonly gitService: GitService) {}

  @Post()
  create(@Body() createGitRepositoryDto: CreateRepositoryDto) {
    return this.gitService.createRepository(createGitRepositoryDto);
  }

  @Post('remote')
  createRemote(@Body() body: CreateRemoteRequest) {
    return this.gitService.createRemoteRepository(
      body.projectId,
      body.provider,
      body.options,
      body.credentialId
    );
  }

  @Post('import')
  import(@Body() body: ImportRequest) {
    let owner = body.owner || '';
    let repoName = body.repoName || '';

    // Parse GitHub URL if provided
    if (body.githubUrl) {
      const urlPattern = /github\.com[/:]([\w-]+)\/([\w.-]+)/;
      const match = body.githubUrl.match(urlPattern);
      if (match) {
        owner = match[1];
        repoName = match[2].replace(/\.git$/, ''); // Remove .git extension if present
      }
    }

    if (!repoName) {
      throw new Error('Repository name is required (either as repoName or in githubUrl)');
    }

    return this.gitService.importRepository(
      body.projectId,
      body.provider,
      owner,
      repoName,
      body.credentialId
    );
  }

  @Get()
  findAll(
    @Query('projectId') projectId?: string,
    @Query('provider') provider?: GitProvider
  ) {
    return this.gitService.findAll(projectId, provider);
  }

  @Get('search')
  search(
    @Query('provider') provider: GitProvider,
    @Query('query') query: string,
    @Query('credentialId') credentialId?: string,
    @Query('limit') limit?: string
  ) {
    return this.gitService.searchRepositories(
      provider,
      query,
      credentialId,
      limit ? parseInt(limit, 10) : undefined
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gitService.findOne(id);
  }

  @Get('project/:projectId')
  findByProject(@Param('projectId') projectId: string) {
    return this.gitService.findByProject(projectId);
  }

  @Get('credential/:credentialId')
  findByCredential(@Param('credentialId') credentialId: string) {
    return this.gitService.getRepositoriesByCredential(credentialId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateGitRepositoryDto: UpdateRepositoryDto
  ) {
    return this.gitService.update(id, updateGitRepositoryDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.gitService.remove(id);
  }

  @Post(':id/sync')
  syncRepository(@Param('id') id: string) {
    return this.gitService.syncRepository(id);
  }

  @Post('sync/project/:projectId')
  async syncProjectRepositories(@Param('projectId') projectId: string) {
    console.log(`[GitController] Sync request for project: ${projectId}`);
    const result = await this.gitService.syncProjectRepositories(projectId);
    console.log(`[GitController] Sync response - repos: ${result.totalRepositories}`);
    return result;
  }

  @Post(':id/clone')
  clone(@Param('id') id: string, @Body() body: CloneRequest) {
    return this.gitService.cloneRepository(id, body.localPath, body.options);
  }

  @Post(':id/pull')
  pull(@Param('id') id: string, @Body() body: PullRequest) {
    return this.gitService.pullChanges(id, body.branch);
  }

  @Post(':id/push')
  push(@Param('id') id: string, @Body() body: PushRequest) {
    return this.gitService.pushChanges(id, body.branch, body.message);
  }

  @Get(':id/branches')
  getBranches(@Param('id') id: string) {
    return this.gitService.getBranches(id);
  }

  @Get(':id/commits')
  getCommits(
    @Param('id') id: string,
    @Query('branch') branch?: string,
    @Query('limit') limit?: string
  ) {
    return this.gitService.getCommits(
      id,
      branch,
      limit ? parseInt(limit, 10) : undefined
    );
  }

  @Get(':id/pull-requests')
  getPullRequests(@Param('id') id: string, @Query('state') state?: string) {
    return this.gitService.getPullRequests(id, state);
  }

  @Get(':id/issues')
  getIssues(
    @Param('id') id: string,
    @Query('state') state?: string,
    @Query('labels') labels?: string
  ) {
    return this.gitService.getIssues(
      id,
      state,
      labels ? labels.split(',') : undefined
    );
  }
}