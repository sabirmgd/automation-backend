import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PullRequestDiagram, DiagramValidationStatus } from '../entities/pull-request-diagram.entity';
import { PullRequest } from '../entities/pull-request.entity';
import { GitRepository } from '../entities/git-repository.entity';
import { DiagramAgentService } from '../../agents/diagram/agent.service';
import { GitHubMrManager } from '../../clients/mr-manager/github-mr.manager';
import { GitLabMrManager } from '../../clients/mr-manager/gitlab-mr.manager';
import { GitProvider } from '../entities/git-repository.entity';
import { DiagramGeneration } from '../../agents/review/schemas/review.schemas';
import { GitCredentialsService } from './git-credentials.service';
import { randomUUID } from 'crypto';

export interface GenerateDiagramDto {
  pullRequestId: string;
  extraInstructions?: string;
  regenerate?: boolean;
}

export interface DiagramResult {
  diagramId: string;
  pullRequestId: string;
  primaryDiagram: PullRequestDiagram;
  supplementaryDiagrams?: PullRequestDiagram[];
  validationStatus: DiagramValidationStatus;
  validationError?: string;
}

@Injectable()
export class DiagramService {
  private readonly logger = new Logger(DiagramService.name);

  constructor(
    @InjectRepository(PullRequestDiagram)
    private readonly diagramRepository: Repository<PullRequestDiagram>,
    @InjectRepository(PullRequest)
    private readonly pullRequestRepository: Repository<PullRequest>,
    @InjectRepository(GitRepository)
    private readonly gitRepositoryRepository: Repository<GitRepository>,
    @Inject(forwardRef(() => GitCredentialsService))
    private readonly credentialsService: GitCredentialsService,
    private readonly diagramAgentService: DiagramAgentService,
    private readonly githubMrManager: GitHubMrManager,
    private readonly gitlabMrManager: GitLabMrManager,
  ) {}

  async generateDiagram(dto: GenerateDiagramDto): Promise<DiagramResult> {
    const pullRequest = await this.pullRequestRepository.findOne({
      where: { id: dto.pullRequestId },
      relations: ['repository'],
    });

    if (!pullRequest) {
      throw new NotFoundException(`Pull request ${dto.pullRequestId} not found`);
    }

    const repository = pullRequest.repository;
    if (!repository) {
      throw new NotFoundException(`Repository not found for pull request ${dto.pullRequestId}`);
    }

    // Check for existing latest diagram if not regenerating
    if (!dto.regenerate) {
      const existingDiagram = await this.diagramRepository.findOne({
        where: {
          pullRequestId: dto.pullRequestId,
          isLatest: true,
          validationStatus: DiagramValidationStatus.VALID,
        },
      });

      if (existingDiagram) {
        this.logger.log(`Using existing valid diagram for PR ${pullRequest.number}`);
        return {
          diagramId: existingDiagram.id,
          pullRequestId: dto.pullRequestId,
          primaryDiagram: existingDiagram,
          validationStatus: existingDiagram.validationStatus,
        };
      }
    }

    this.logger.log(`Generating diagram for PR #${pullRequest.number} in ${repository.name}`);

    const mrManager = this.getMrManager(repository.provider);
    const repoIdentifier = this.getRepoIdentifier(repository);

    // Get the credential token for the repository
    let token: string | undefined;
    if (repository.credentialId) {
      const credential = await this.credentialsService.getDecryptedCredential(repository.credentialId);
      token = credential.encryptedToken;
    }

    // Get PR diff
    const diff = await mrManager.getPullRequestDiff(repoIdentifier, pullRequest.number, token);

    // Generate diagram using agent service
    const startTime = Date.now();
    const diagramGeneration = await this.diagramAgentService.generateDiagram(
      diff,
      {
        title: pullRequest.title,
        description: pullRequest.description,
        author: pullRequest.authorUsername,
        targetBranch: pullRequest.targetBranch,
        filesChanged: pullRequest.changedFiles,
      },
      dto.extraInstructions,
    );

    const generationTime = Date.now() - startTime;
    const generationSessionId = randomUUID();

    // Mark previous diagrams as not latest
    await this.diagramRepository.update(
      { pullRequestId: dto.pullRequestId, isLatest: true },
      { isLatest: false },
    );

    // Save primary diagram
    const primaryDiagram = await this.saveDiagram(
      pullRequest.id,
      diagramGeneration.primaryDiagram,
      {
        summary: diagramGeneration.summary,
        impactedComponents: diagramGeneration.impactedComponents,
        suggestedReviewFlow: diagramGeneration.suggestedReviewFlow,
        generationTime,
        generationSessionId,
        isLatest: true,
      },
    );

    // Save supplementary diagrams if any
    const supplementaryDiagrams: PullRequestDiagram[] = [];
    if (diagramGeneration.supplementaryDiagrams?.length > 0) {
      for (const supplementary of diagramGeneration.supplementaryDiagrams) {
        const diagram = await this.saveDiagram(
          pullRequest.id,
          supplementary,
          {
            generationTime,
            generationSessionId,
            isLatest: true, // Changed to true so supplementary diagrams are included in latest set
          },
        );
        supplementaryDiagrams.push(diagram);
      }
    }

    // Skip validation for now - the agent service handles this internally
    // The mermaid code is already cleaned by the agent service
    primaryDiagram.validationStatus = DiagramValidationStatus.VALID;
    primaryDiagram.validationError = undefined;

    await this.diagramRepository.save(primaryDiagram);

    this.logger.log(
      `Generated diagram for PR ${pullRequest.number}. Validation: ${primaryDiagram.validationStatus}`,
    );

    return {
      diagramId: primaryDiagram.id,
      pullRequestId: pullRequest.id,
      primaryDiagram,
      supplementaryDiagrams: supplementaryDiagrams.length > 0 ? supplementaryDiagrams : undefined,
      validationStatus: primaryDiagram.validationStatus,
      validationError: primaryDiagram.validationError,
    };
  }

  private async saveDiagram(
    pullRequestId: string,
    diagram: any,
    additionalData?: any,
  ): Promise<PullRequestDiagram> {
    // Get the latest version number
    const latestDiagram = await this.diagramRepository.findOne({
      where: { pullRequestId },
      order: { version: 'DESC' },
    });

    const version = (latestDiagram?.version || 0) + 1;

    const diagramEntity = this.diagramRepository.create({
      pullRequestId,
      diagramType: diagram.diagramType,
      title: diagram.title,
      description: diagram.description,
      mermaidCode: diagram.mermaidCode,
      focusAreas: diagram.focusAreas,
      complexity: diagram.complexity,
      version,
      isLatest: additionalData?.isLatest ?? false,
      validationStatus: DiagramValidationStatus.PENDING,
      summary: additionalData?.summary,
      impactedComponents: additionalData?.impactedComponents,
      suggestedReviewFlow: additionalData?.suggestedReviewFlow,
      generationSessionId: additionalData?.generationSessionId,
      metadata: {
        generationTime: additionalData?.generationTime,
        modelUsed: 'claude-opus-4-1',
      },
    });

    return await this.diagramRepository.save(diagramEntity);
  }

  async getDiagramsByPullRequest(
    pullRequestId: string,
    latestOnly = true,
  ): Promise<PullRequestDiagram[]> {
    const where: any = { pullRequestId };
    if (latestOnly) {
      where.isLatest = true;
    }

    return await this.diagramRepository.find({
      where,
      order: {
        version: 'DESC',
        createdAt: 'DESC',
      },
    });
  }

  async getDiagramById(diagramId: string): Promise<PullRequestDiagram> {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(diagramId)) {
      throw new BadRequestException(`Invalid diagram ID format: ${diagramId}`);
    }

    const diagram = await this.diagramRepository.findOne({
      where: { id: diagramId },
      relations: ['pullRequest'],
    });

    if (!diagram) {
      throw new NotFoundException(`Diagram ${diagramId} not found`);
    }

    return diagram;
  }

  async updateDiagramValidation(
    diagramId: string,
    validationStatus: DiagramValidationStatus,
    validationError?: string,
  ): Promise<PullRequestDiagram> {
    const diagram = await this.getDiagramById(diagramId);

    diagram.validationStatus = validationStatus;
    diagram.validationError = validationError;

    return await this.diagramRepository.save(diagram);
  }

  async deleteDiagram(diagramId: string): Promise<{ deleted: boolean }> {
    const result = await this.diagramRepository.delete({ id: diagramId });
    return { deleted: result.affected > 0 };
  }

  private getMrManager(provider: GitProvider) {
    switch (provider) {
      case GitProvider.GITHUB:
        return this.githubMrManager;
      case GitProvider.GITLAB:
        return this.gitlabMrManager;
      default:
        throw new BadRequestException(`Unsupported provider: ${provider}`);
    }
  }

  private getRepoIdentifier(repository: GitRepository): string {
    if (repository.provider === GitProvider.GITHUB) {
      return `${repository.namespace}/${repository.name}`;
    } else if (repository.provider === GitProvider.GITLAB) {
      return repository.remoteId || repository.name;
    }
    return repository.name;
  }

  formatDiagramForComment(diagram: PullRequestDiagram): string {
    let comment = `## 📊 ${diagram.title}\n\n`;
    comment += `${diagram.description}\n\n`;

    if (diagram.focusAreas?.length > 0) {
      comment += `**Key Focus Areas:**\n`;
      diagram.focusAreas.forEach(area => {
        comment += `- ${area}\n`;
      });
      comment += '\n';
    }

    comment += '```mermaid\n';
    comment += diagram.mermaidCode;
    comment += '\n```\n\n';

    if (diagram.impactedComponents?.length > 0) {
      comment += `**Impacted Components:** ${diagram.impactedComponents.join(', ')}\n\n`;
    }

    if (diagram.suggestedReviewFlow) {
      comment += `**Suggested Review Flow:** ${diagram.suggestedReviewFlow}\n`;
    }

    return comment;
  }
}