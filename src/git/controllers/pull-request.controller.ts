import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Delete,
  Patch,
} from '@nestjs/common';
import { PullRequestService } from '../services/pull-request.service';
import { PullRequestStatus } from '../entities/pull-request.entity';

@Controller('git/pull-requests')
export class PullRequestController {
  constructor(private readonly pullRequestService: PullRequestService) {}

  @Get()
  async getAllPullRequests(
    @Query('repositoryId') repositoryId?: string,
    @Query('projectId') projectId?: string,
    @Query('status') status?: PullRequestStatus,
    @Query('authorUsername') authorUsername?: string,
  ) {
    if (projectId) {
      return this.pullRequestService.findByProject(projectId);
    }

    return this.pullRequestService.findAll({
      repositoryId,
      status,
      authorUsername,
    });
  }

  @Get(':id')
  async getPullRequest(@Param('id') id: string) {
    return this.pullRequestService.findOne(id);
  }

  @Get('repository/:repositoryId')
  async getPullRequestsByRepository(
    @Param('repositoryId') repositoryId: string,
    @Query('status') status?: PullRequestStatus,
    @Query('autoSync') autoSync?: string,
  ) {
    // Auto-sync PRs from GitHub if requested (default: true)
    if (autoSync !== 'false') {
      await this.pullRequestService.syncRepositoryPullRequests(repositoryId);
    }

    // Default to showing only open PRs unless status is explicitly provided
    return this.pullRequestService.findAll({
      repositoryId,
      status: status || PullRequestStatus.OPEN,
    });
  }

  @Get('project/:projectId')
  async getPullRequestsByProject(@Param('projectId') projectId: string) {
    return this.pullRequestService.findByProject(projectId);
  }

  @Get('ticket/:ticketKey')
  async getPullRequestsByTicket(@Param('ticketKey') ticketKey: string) {
    return this.pullRequestService.findByTicket(ticketKey);
  }

  @Post()
  async createPullRequest(
    @Body() createDto: {
      repositoryId: string;
      pullRequestData: any;
    },
  ) {
    return this.pullRequestService.create(
      createDto.repositoryId,
      createDto.pullRequestData,
    );
  }

  @Patch(':id')
  async updatePullRequest(
    @Param('id') id: string,
    @Body() updateDto: any,
  ) {
    return this.pullRequestService.update(id, updateDto);
  }

  @Patch(':id/status')
  async updatePullRequestStatus(
    @Param('id') id: string,
    @Body() statusDto: { status: PullRequestStatus; additionalData?: any },
  ) {
    return this.pullRequestService.updateStatus(
      id,
      statusDto.status,
      statusDto.additionalData,
    );
  }

  @Post(':id/link-tickets')
  async linkTickets(
    @Param('id') id: string,
    @Body() linkDto: { ticketKeys: string[] },
  ) {
    return this.pullRequestService.linkToTickets(id, linkDto.ticketKeys);
  }

  @Post(':id/unlink-tickets')
  async unlinkTickets(
    @Param('id') id: string,
    @Body() unlinkDto: { ticketKeys: string[] },
  ) {
    return this.pullRequestService.unlinkFromTickets(id, unlinkDto.ticketKeys);
  }

  @Delete(':id')
  async deletePullRequest(@Param('id') id: string) {
    await this.pullRequestService.remove(id);
    return { success: true };
  }

  @Post('sync')
  async syncPullRequests(
    @Body() syncDto: { repositoryId: string; remotePRData: any[] },
  ) {
    return this.pullRequestService.syncFromRemote(
      syncDto.repositoryId,
      syncDto.remotePRData,
    );
  }
}