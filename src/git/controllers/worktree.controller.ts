import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WorktreeService } from '../services/worktree.service';
import {
  CreateWorktreeDto,
  UpdateWorktreeDto,
  WorktreeListFiltersDto,
  RemoveWorktreeDto,
  WorktreeResponseDto,
  WorktreeStatsDto,
  CleanupWorktreesDto,
  CleanupResultDto,
} from '../dto/worktree.dto';

@Controller('git/worktrees')
export class WorktreeController {
  constructor(private readonly worktreeService: WorktreeService) {}

  /**
   * Create a new worktree
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateWorktreeDto): Promise<WorktreeResponseDto> {
    return this.worktreeService.createWorktree(dto);
  }

  /**
   * List all worktrees with optional filters
   */
  @Get()
  async findAll(@Query() filters: WorktreeListFiltersDto): Promise<WorktreeResponseDto[]> {
    return this.worktreeService.listWorktrees(filters);
  }

  /**
   * Get worktree statistics
   */
  @Get('stats')
  async getStats(@Query('repositoryId') repositoryId?: string): Promise<WorktreeStatsDto> {
    return this.worktreeService.getWorktreeStats(repositoryId);
  }

  /**
   * Get a single worktree by ID
   */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<WorktreeResponseDto> {
    return this.worktreeService.findOne(id);
  }

  /**
   * Get worktree by branch name
   */
  @Get('repository/:repositoryId/branch/:branchName')
  async findByBranch(
    @Param('repositoryId') repositoryId: string,
    @Param('branchName') branchName: string,
  ): Promise<WorktreeResponseDto | null> {
    return this.worktreeService.findByBranch(repositoryId, branchName);
  }

  /**
   * Get worktrees by ticket
   */
  @Get('ticket/:ticketId')
  async findByTicket(@Param('ticketId') ticketId: string): Promise<WorktreeResponseDto[]> {
    return this.worktreeService.findByTicket(ticketId);
  }

  /**
   * Get active worktree for a ticket
   */
  @Get('ticket/:ticketId/active')
  async findActiveByTicket(
    @Param('ticketId') ticketId: string,
  ): Promise<WorktreeResponseDto | null> {
    return this.worktreeService.findActiveByTicket(ticketId);
  }

  /**
   * List git worktrees for a repository
   */
  @Get('repository/:repositoryId/git-list')
  async listGitWorktrees(@Param('repositoryId') repositoryId: string) {
    return this.worktreeService.listGitWorktrees(repositoryId);
  }

  /**
   * Update a worktree
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWorktreeDto,
  ): Promise<WorktreeResponseDto> {
    return this.worktreeService.updateWorktree(id, dto);
  }

  /**
   * Switch to a worktree (returns path)
   */
  @Post(':id/switch')
  async switchTo(@Param('id') id: string): Promise<{ path: string }> {
    const path = await this.worktreeService.switchToWorktree(id);
    return { path };
  }

  /**
   * Remove a worktree
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Body() dto?: RemoveWorktreeDto): Promise<void> {
    return this.worktreeService.removeWorktree(id, dto);
  }

  /**
   * Cleanup stale worktrees for a repository
   */
  @Post('repository/:repositoryId/cleanup')
  async cleanup(
    @Param('repositoryId') repositoryId: string,
    @Body() dto?: CleanupWorktreesDto,
  ): Promise<CleanupResultDto> {
    return this.worktreeService.cleanupWorktrees(repositoryId, dto);
  }
}
