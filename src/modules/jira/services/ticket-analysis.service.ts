import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketAnalysis, AnalysisStatus, AnalysisType } from '../entities';
import { CreateAnalysisDto, UpdateAnalysisDto } from '../dto/ticket-analysis.dto';

@Injectable()
export class TicketAnalysisService {
  constructor(
    @InjectRepository(TicketAnalysis)
    private readonly analysisRepository: Repository<TicketAnalysis>,
  ) {}

  async create(createDto: CreateAnalysisDto): Promise<TicketAnalysis> {
    const analysis = this.analysisRepository.create({
      ...createDto,
      status: AnalysisStatus.PENDING,
    });
    return await this.analysisRepository.save(analysis);
  }

  async findAll(ticketId?: string): Promise<TicketAnalysis[]> {
    const where = ticketId ? { ticketId } : {};
    return await this.analysisRepository.find({
      where,
      relations: ['ticket'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<TicketAnalysis> {
    const analysis = await this.analysisRepository.findOne({
      where: { id },
      relations: ['ticket', 'analyzedBy'],
    });

    if (!analysis) {
      throw new NotFoundException(`Analysis with ID ${id} not found`);
    }

    return analysis;
  }

  async startAnalysis(id: string): Promise<TicketAnalysis> {
    const analysis = await this.findOne(id);
    analysis.status = AnalysisStatus.IN_PROGRESS;
    return await this.analysisRepository.save(analysis);
  }

  async completeAnalysis(id: string, updateDto: UpdateAnalysisDto): Promise<TicketAnalysis> {
    const analysis = await this.findOne(id);
    Object.assign(analysis, {
      ...updateDto,
      status: AnalysisStatus.COMPLETED,
      completedAt: new Date(),
    });
    return await this.analysisRepository.save(analysis);
  }

  async failAnalysis(id: string, errorMessage: string): Promise<TicketAnalysis> {
    const analysis = await this.findOne(id);
    analysis.status = AnalysisStatus.FAILED;
    analysis.errorMessage = errorMessage;
    analysis.completedAt = new Date();
    return await this.analysisRepository.save(analysis);
  }

  async getLatestAnalysisForTicket(ticketId: string, type?: AnalysisType): Promise<TicketAnalysis | null> {
    const where: any = {
      ticketId,
      status: AnalysisStatus.COMPLETED,
    };

    if (type) {
      where.analysisType = type;
    }

    return await this.analysisRepository.findOne({
      where,
      order: { completedAt: 'DESC' },
      relations: ['ticket'],
    });
  }

  async getAnalysesByStatus(status: AnalysisStatus): Promise<TicketAnalysis[]> {
    return await this.analysisRepository.find({
      where: { status },
      relations: ['ticket'],
      order: { createdAt: 'ASC' },
    });
  }

  async remove(id: string): Promise<void> {
    const result = await this.analysisRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Analysis with ID ${id} not found`);
    }
  }

  async getAnalysisMetrics(boardId?: string): Promise<any> {
    const queryBuilder = this.analysisRepository
      .createQueryBuilder('analysis')
      .leftJoin('analysis.ticket', 'ticket')
      .select([
        'analysis.analysisType as type',
        'analysis.status as status',
        'COUNT(*) as count',
        'AVG(analysis.processingTime) as avgProcessingTime',
      ])
      .groupBy('analysis.analysisType, analysis.status');

    if (boardId) {
      queryBuilder.where('ticket.boardId = :boardId', { boardId });
    }

    const results = await queryBuilder.getRawMany();

    const metrics = {
      total: 0,
      byType: {} as any,
      byStatus: {} as any,
      avgProcessingTime: 0,
    };

    results.forEach((row) => {
      metrics.total += parseInt(row.count);

      if (!metrics.byType[row.type]) {
        metrics.byType[row.type] = 0;
      }
      metrics.byType[row.type] += parseInt(row.count);

      if (!metrics.byStatus[row.status]) {
        metrics.byStatus[row.status] = 0;
      }
      metrics.byStatus[row.status] += parseInt(row.count);
    });

    const avgTimeResult = await this.analysisRepository
      .createQueryBuilder('analysis')
      .select('AVG(analysis.processingTime)', 'avg')
      .where('analysis.processingTime IS NOT NULL')
      .getRawOne();

    metrics.avgProcessingTime = avgTimeResult?.avg || 0;

    return metrics;
  }
}