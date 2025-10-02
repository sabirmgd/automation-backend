import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  HttpException,
  HttpStatus,
  Query,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { DiagramService, GenerateDiagramDto } from '../services/diagram.service';
import { GitLabMrManager } from '../../clients/mr-manager/gitlab-mr.manager';
import { GitHubMrManager } from '../../clients/mr-manager/github-mr.manager';
import { PullRequestDiagram } from '../entities/pull-request-diagram.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PullRequest } from '../entities/pull-request.entity';
import { GitRepository, GitProvider } from '../entities/git-repository.entity';
import { GitCredentialsService } from '../services/git-credentials.service';

export interface GenerateDiagramFromDiffDto {
  projectId: number | string;
  mrNumber: number;
  extraInstructions?: string;
  regenerate?: boolean;
}

export interface GenerateDiagramResponse {
  success: boolean;
  diagramId?: string;
  diagram?: {
    title: string;
    description: string;
    mermaidCode: string;
    type: string;
    validationStatus: string;
    validationError?: string;
  };
  supplementaryDiagrams?: Array<{
    title: string;
    description: string;
    mermaidCode: string;
    type: string;
  }>;
  formattedComment?: string;
  error?: string;
}

@Controller('diagrams')
export class DiagramController {
  constructor(
    private readonly diagramService: DiagramService,
    @InjectRepository(PullRequest)
    private readonly pullRequestRepository: Repository<PullRequest>,
    @InjectRepository(GitRepository)
    private readonly gitRepositoryRepository: Repository<GitRepository>,
    @Inject(forwardRef(() => GitCredentialsService))
    private readonly credentialsService: GitCredentialsService,
    private readonly gitlabMrManager: GitLabMrManager,
    private readonly githubMrManager: GitHubMrManager,
  ) {}

  /**
   * Generate diagram from PR/MR diff and save to database
   */
  @Post('generate-from-diff')
  async generateFromDiff(
    @Body() dto: GenerateDiagramFromDiffDto,
  ): Promise<GenerateDiagramResponse> {
    try {
      // Determine the provider based on projectId format
      const isGitHub = typeof dto.projectId === 'string' && dto.projectId.includes('/');
      const mrManager = isGitHub ? this.githubMrManager : this.gitlabMrManager;

      // FIRST: Check if repository exists in database
      // For GitHub, we should look by namespace and name
      let repository: GitRepository | null = null;

      if (isGitHub) {
        const [namespace, name] = dto.projectId.toString().split('/');
        repository = await this.gitRepositoryRepository.findOne({
          where: {
            namespace: namespace,
            name: name,
            provider: GitProvider.GITHUB,
          },
        });
      } else {
        repository = await this.gitRepositoryRepository.findOne({
          where: {
            remoteId: dto.projectId.toString(),
          },
        });
      }

      // If repository doesn't exist, we can't proceed without credentials
      if (!repository) {
        throw new HttpException(
          `Repository ${dto.projectId} not found. Please sync the repository first with proper credentials.`,
          HttpStatus.NOT_FOUND,
        );
      }

      // Get credentials for the repository
      let token: string | undefined;
      if (repository.credentialId) {
        const credential = await this.credentialsService.getDecryptedCredential(repository.credentialId);
        token = credential.encryptedToken;
      } else {
        throw new HttpException(
          `No credentials found for repository ${dto.projectId}. Please configure repository credentials.`,
          HttpStatus.UNAUTHORIZED,
        );
      }

      // NOW: Get PR diff with proper credentials
      const diff = await mrManager.getPullRequestDiff(
        dto.projectId.toString(),
        dto.mrNumber,
        token,
      );

      // Get PR details for context
      const prDetails = await mrManager.getPullRequestStatus(
        dto.projectId.toString(),
        dto.mrNumber,
        token,
      );

      // Check if pull request exists in database
      let pullRequest = await this.pullRequestRepository.findOne({
        where: {
          repositoryId: repository.id,
          number: dto.mrNumber,
        },
        relations: ['repository'],
      });

      // Create pull request if it doesn't exist
      if (!pullRequest) {
        pullRequest = new PullRequest();
        pullRequest.repositoryId = repository.id;
        pullRequest.repository = repository;
        pullRequest.remoteId = `${dto.projectId}-${dto.mrNumber}`;
        pullRequest.number = dto.mrNumber;
        pullRequest.title = prDetails.title;
        pullRequest.targetBranch = prDetails.targetBranch;
        pullRequest.sourceBranch = prDetails.sourceBranch;
        pullRequest.status = prDetails.status as any;
        pullRequest.url = prDetails.url || '';
        pullRequest.isConflicted = prDetails.hasConflicts || false;

        pullRequest = await this.pullRequestRepository.save(pullRequest);
      }

      // Check for existing diagram if not regenerating
      if (!dto.regenerate) {
        const existingDiagram = await this.diagramService.getDiagramsByPullRequest(
          pullRequest.id,
          true, // latest only
        );

        if (existingDiagram.length > 0 && existingDiagram[0].validationStatus === 'valid') {
          // Return existing valid diagram
          const diagram = existingDiagram[0];
          const formattedComment = this.diagramService.formatDiagramForComment(diagram);

          return {
            success: true,
            diagramId: diagram.id,
            diagram: {
              title: diagram.title,
              description: diagram.description,
              mermaidCode: diagram.mermaidCode,
              type: diagram.diagramType,
              validationStatus: diagram.validationStatus,
            },
            supplementaryDiagrams: diagram.metadata?.supplementaryDiagrams?.map(d => ({
              title: d.title,
              description: d.description,
              mermaidCode: d.mermaidCode,
              type: d.diagramType,
            })),
            formattedComment,
          };
        }
      }

      // Use the diagram service to generate and save the diagram
      const result = await this.diagramService.generateDiagram({
        pullRequestId: pullRequest.id,
        extraInstructions: dto.extraInstructions,
        regenerate: dto.regenerate || false,
      });

      // Get the saved diagram for response
      const diagram = result.primaryDiagram;

      // Format the comment using the service
      const formattedComment = this.diagramService.formatDiagramForComment(diagram);

      return {
        success: true,
        diagramId: diagram.id,
        diagram: {
          title: diagram.title,
          description: diagram.description,
          mermaidCode: diagram.mermaidCode,
          type: diagram.diagramType,
          validationStatus: diagram.validationStatus,
          validationError: diagram.validationError,
        },
        supplementaryDiagrams: result.supplementaryDiagrams?.map(d => ({
          title: d.title,
          description: d.description,
          mermaidCode: d.mermaidCode,
          type: d.diagramType,
        })),
        formattedComment,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: `Failed to generate diagram: ${error.message}`,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Generate and store diagram for an existing pull request
   */
  @Post('generate')
  async generateDiagram(@Body() dto: GenerateDiagramDto) {
    try {
      const result = await this.diagramService.generateDiagram(dto);

      // Format the response
      return {
        success: true,
        diagramId: result.diagramId,
        pullRequestId: result.pullRequestId,
        primaryDiagram: {
          id: result.primaryDiagram.id,
          title: result.primaryDiagram.title,
          description: result.primaryDiagram.description,
          type: result.primaryDiagram.diagramType,
          mermaidCode: result.primaryDiagram.mermaidCode,
          validationStatus: result.validationStatus,
          validationError: result.validationError,
          version: result.primaryDiagram.version,
        },
        supplementaryDiagrams: result.supplementaryDiagrams?.map(d => ({
          id: d.id,
          title: d.title,
          description: d.description,
          type: d.diagramType,
          mermaidCode: d.mermaidCode,
        })),
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get diagrams for a pull request
   */
  @Get('pull-request/:pullRequestId')
  async getDiagramsByPullRequest(
    @Param('pullRequestId') pullRequestId: string,
    @Query('latestOnly') latestOnly?: string,
  ) {
    const diagrams = await this.diagramService.getDiagramsByPullRequest(
      pullRequestId,
      latestOnly !== 'false',
    );

    return {
      success: true,
      pullRequestId,
      diagrams: diagrams.map(d => ({
        id: d.id,
        title: d.title,
        description: d.description,
        type: d.diagramType,
        mermaidCode: d.mermaidCode,
        version: d.version,
        isLatest: d.isLatest,
        validationStatus: d.validationStatus,
        createdAt: d.createdAt,
      })),
    };
  }

  /**
   * Get a specific diagram by ID
   */
  @Get(':id')
  async getDiagram(@Param('id') id: string) {
    const diagram = await this.diagramService.getDiagramById(id);

    return {
      success: true,
      diagram: {
        id: diagram.id,
        pullRequestId: diagram.pullRequestId,
        title: diagram.title,
        description: diagram.description,
        type: diagram.diagramType,
        mermaidCode: diagram.mermaidCode,
        version: diagram.version,
        isLatest: diagram.isLatest,
        validationStatus: diagram.validationStatus,
        validationError: diagram.validationError,
        focusAreas: diagram.focusAreas,
        impactedComponents: diagram.impactedComponents,
        suggestedReviewFlow: diagram.suggestedReviewFlow,
        createdAt: diagram.createdAt,
        updatedAt: diagram.updatedAt,
      },
    };
  }

  /**
   * Get formatted diagram comment for posting to PR
   */
  @Get(':id/formatted-comment')
  async getFormattedComment(@Param('id') id: string) {
    const diagram = await this.diagramService.getDiagramById(id);
    const formattedComment = this.diagramService.formatDiagramForComment(diagram);

    return {
      success: true,
      diagramId: id,
      comment: formattedComment,
    };
  }

  /**
   * Delete a diagram
   */
  @Delete(':id')
  async deleteDiagram(@Param('id') id: string) {
    const result = await this.diagramService.deleteDiagram(id);
    return {
      success: result.deleted,
      message: result.deleted ? 'Diagram deleted successfully' : 'Diagram not found',
    };
  }
}