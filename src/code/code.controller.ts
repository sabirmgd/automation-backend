import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { CodeService } from './code.service';
import { BranchNameService } from './branch-name.service';
import { CreateAnalysisDto } from './dto/create-analysis.dto';
import { GenerateBranchNameDto } from './dto/generate-branch-name.dto';

@Controller('code')
export class CodeController {
  constructor(
    private readonly codeService: CodeService,
    private readonly branchNameService: BranchNameService,
  ) {}

  @Post('analysis')
  async createPreliminaryAnalysis(@Body() dto: CreateAnalysisDto) {
    return this.codeService.createPreliminaryAnalysis(dto.projectId, dto.ticketId);
  }

  @Get('analysis/check-ai-comments')
  async checkAIComments(@Query('ticketIds') ticketIds: string) {
    const ids = ticketIds.split(',');
    return this.codeService.checkForNewAIComments(ids);
  }

  @Post('branch-name')
  async generateBranchName(@Body() dto: GenerateBranchNameDto) {
    return this.branchNameService.generateBranchName(
      dto.projectId,
      dto.ticketId,
      dto.options,
    );
  }
}