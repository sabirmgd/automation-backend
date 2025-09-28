import { PartialType } from '@nestjs/mapped-types';
import { CreateTaskDto } from './create-task.dto';
import { IsOptional, IsDateString, IsNumber, Min } from 'class-validator';

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualHours?: number;
}