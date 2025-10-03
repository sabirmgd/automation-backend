import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { CodeService } from './code.service';
import { CreateAnalysisDto } from './dto/create-analysis.dto';

@Controller('code')
export class CodeController {
  constructor(private readonly codeService: CodeService) {}

  @Post('analysis')
  async createPreliminaryAnalysis(@Body() dto: CreateAnalysisDto) {
    return this.codeService.createPreliminaryAnalysis(dto.projectId, dto.ticketId);
  }

  @Get('analysis/check-ai-comments')
  async checkAIComments(@Query('ticketIds') ticketIds: string) {
    const ids = ticketIds.split(',');
    return this.codeService.checkForNewAIComments(ids);
  }
}