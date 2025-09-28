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
import { GitCredentialsService } from '../services/git-credentials.service';
import { CreateGitCredentialDto as CreateCredentialDto } from '../dto/create-git-credential.dto';
import { UpdateGitCredentialDto as UpdateCredentialDto } from '../dto/update-git-credential.dto';
import { GitProvider } from '../entities/git-repository.entity';
import { CredentialType } from '../entities/git-credential.entity';

interface GenerateSSHKeyRequest {
  name: string;
  provider: GitProvider;
  email?: string;
}

interface GenerateSSHKeyResponse {
  id: string;
  name: string;
  provider: GitProvider;
  publicKey: string;
  createdAt: Date;
}

interface RotateTokenRequest {
  newToken: string;
}

interface ValidateResponse {
  valid: boolean;
}

@Controller('git/credentials')
export class GitCredentialsController {
  constructor(private readonly credentialsService: GitCredentialsService) {}

  @Post()
  create(@Body() createGitCredentialDto: CreateCredentialDto) {
    return this.credentialsService.create(createGitCredentialDto);
  }

  @Post('ssh-key')
  async generateSSHKey(@Body() body: GenerateSSHKeyRequest): Promise<GenerateSSHKeyResponse> {
    const { privateKey, publicKey } = await this.credentialsService.generateSSHKeyPair(
      body.name,
      body.provider,
      body.email
    );

    const credential = await this.credentialsService.create({
      name: body.name,
      type: CredentialType.SSH_KEY,
      provider: body.provider,
      privateKey,
      publicKey,
      isActive: true,
    });

    return {
      id: credential.id,
      name: credential.name,
      provider: credential.provider as GitProvider,
      publicKey: credential.publicKey!,
      createdAt: credential.createdAt,
    };
  }

  @Get()
  findAll(
    @Query('provider') provider?: GitProvider,
    @Query('projectId') projectId?: string
  ) {
    return this.credentialsService.findAll(provider, projectId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.credentialsService.findOne(id);
  }

  @Get('name/:name')
  findByName(
    @Param('name') name: string,
    @Query('provider') provider: GitProvider
  ) {
    return this.credentialsService.findByName(name, provider);
  }

  @Get('default/:provider')
  findDefault(
    @Param('provider') provider: GitProvider,
    @Query('projectId') projectId?: string
  ) {
    return this.credentialsService.findDefault(provider, projectId);
  }

  @Get('project/:projectId')
  findByProject(
    @Param('projectId') projectId: string,
    @Query('provider') provider?: GitProvider
  ) {
    return this.credentialsService.findByProject(projectId, provider);
  }

  @Get('project/:projectId/available')
  findAvailableForProject(
    @Param('projectId') projectId: string,
    @Query('provider') provider?: GitProvider
  ) {
    return this.credentialsService.findAvailableForProject(projectId, provider);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateGitCredentialDto: UpdateCredentialDto
  ) {
    return this.credentialsService.update(id, updateGitCredentialDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.credentialsService.remove(id);
  }

  @Post(':id/validate')
  async validate(@Param('id') id: string): Promise<ValidateResponse> {
    const valid = await this.credentialsService.validateCredential(id);
    return { valid };
  }

  @Post(':id/rotate-token')
  rotateToken(@Param('id') id: string, @Body() body: RotateTokenRequest) {
    return this.credentialsService.rotateToken(id, body.newToken);
  }
}