import { Controller, Get, Post, Body, Param, Delete, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { TicketAnalysisService } from '../services/ticket-analysis.service';
import { CreateAnalysisDto, UpdateAnalysisDto } from '../dto/ticket-analysis.dto';
import { AnalysisType, AnalysisStatus, TicketAnalysis } from '../entities';

@Controller('jira/analyses')
export class TicketAnalysisController {
  constructor(private readonly ticketAnalysisService: TicketAnalysisService) {}

  @Post()
  create(@Body() createAnalysisDto: CreateAnalysisDto): Promise<TicketAnalysis> {
    return this.ticketAnalysisService.create(createAnalysisDto);
  }

  @Get()
  findAll(@Query('ticketId') ticketId?: string): Promise<TicketAnalysis[]> {
    return this.ticketAnalysisService.findAll(ticketId);
  }

  @Get('metrics')
  getMetrics(@Query('boardId') boardId?: string): Promise<any> {
    return this.ticketAnalysisService.getAnalysisMetrics(boardId);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<TicketAnalysis> {
    return this.ticketAnalysisService.findOne(id);
  }

  @Post(':id/start')
  startAnalysis(@Param('id') id: string): Promise<TicketAnalysis> {
    return this.ticketAnalysisService.startAnalysis(id);
  }

  @Post(':id/complete')
  completeAnalysis(
    @Param('id') id: string,
    @Body() updateAnalysisDto: UpdateAnalysisDto,
  ): Promise<TicketAnalysis> {
    return this.ticketAnalysisService.completeAnalysis(id, updateAnalysisDto);
  }

  @Post(':id/fail')
  failAnalysis(
    @Param('id') id: string,
    @Body('errorMessage') errorMessage: string,
  ): Promise<TicketAnalysis> {
    return this.ticketAnalysisService.failAnalysis(id, errorMessage);
  }

  @Get('ticket/:ticketId/latest')
  getLatestAnalysis(
    @Param('ticketId') ticketId: string,
    @Query('type') type?: AnalysisType,
  ): Promise<TicketAnalysis | null> {
    return this.ticketAnalysisService.getLatestAnalysisForTicket(ticketId, type);
  }

  @Get('status/:status')
  getByStatus(@Param('status') status: AnalysisStatus): Promise<TicketAnalysis[]> {
    return this.ticketAnalysisService.getAnalysesByStatus(status);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.ticketAnalysisService.remove(id);
  }
}