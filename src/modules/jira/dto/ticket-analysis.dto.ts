import { IsUUID, IsEnum, IsOptional, IsString, IsObject, IsNumber } from 'class-validator';
import { AnalysisType } from '../entities';

export class CreateAnalysisDto {
  @IsUUID()
  ticketId: string;

  @IsEnum(AnalysisType)
  analysisType: AnalysisType;

  @IsOptional()
  @IsString()
  analysisName?: string;

  @IsOptional()
  @IsString()
  analysisEngine?: string;

  @IsOptional()
  @IsString()
  modelVersion?: string;

  @IsOptional()
  @IsUUID()
  analyzedById?: string;
}

export class UpdateAnalysisDto {
  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsObject()
  metrics?: {
    complexity?: number;
    estimatedHours?: number;
    riskLevel?: string;
    sentiment?: string;
    priority?: number;
    confidence?: number;
    [key: string]: any;
  };

  @IsOptional()
  @IsObject()
  recommendations?: {
    action?: string;
    reasoning?: string;
    suggestedAssignee?: string;
    suggestedPriority?: string;
    suggestedLabels?: string[];
    [key: string]: any;
  };

  @IsOptional()
  @IsObject()
  insights?: {
    patterns?: string[];
    dependencies?: string[];
    blockers?: string[];
    relatedTickets?: string[];
    [key: string]: any;
  };

  @IsOptional()
  @IsString()
  rawAnalysisData?: string;

  @IsOptional()
  @IsNumber()
  processingTime?: number;
}