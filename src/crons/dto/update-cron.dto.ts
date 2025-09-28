import { PartialType } from '@nestjs/mapped-types';
import { CreateCronDto } from './create-cron.dto';

export class UpdateCronDto extends PartialType(CreateCronDto) {}