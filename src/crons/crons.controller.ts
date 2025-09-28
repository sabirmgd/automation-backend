import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CronsService } from './crons.service';
import { CreateCronDto } from './dto/create-cron.dto';
import { UpdateCronDto } from './dto/update-cron.dto';

@Controller('crons')
export class CronsController {
  constructor(private readonly cronsService: CronsService) {}

  @Post()
  create(@Body() createCronDto: CreateCronDto) {
    return this.cronsService.create(createCronDto);
  }

  @Get()
  findAll() {
    return this.cronsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cronsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCronDto: UpdateCronDto) {
    return this.cronsService.update(id, updateCronDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.cronsService.remove(id);
  }

  @Post(':id/toggle')
  toggle(@Param('id') id: string) {
    return this.cronsService.toggle(id);
  }

  @Post(':id/run')
  manualRun(@Param('id') id: string) {
    return this.cronsService.manualRun(id);
  }

  @Get(':id/executions')
  getExecutions(@Param('id') id: string) {
    return this.cronsService.getExecutions(id);
  }
}