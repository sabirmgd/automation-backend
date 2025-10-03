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
  ValidationPipe,
  Query,
} from '@nestjs/common';
import { PromptsService } from './prompts.service';
import { CreatePromptDto } from './dto/create-prompt.dto';
import { UpdatePromptDto } from './dto/update-prompt.dto';

@Controller('prompts')
export class PromptsController {
  constructor(private readonly promptsService: PromptsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(ValidationPipe) createPromptDto: CreatePromptDto) {
    return this.promptsService.create(createPromptDto);
  }

  @Get()
  findAll(@Query('projectId') projectId?: string) {
    return this.promptsService.findAll(projectId);
  }

  @Get('global')
  findGlobalPrompts() {
    return this.promptsService.findGlobalPrompts();
  }

  @Get('by-name/:name')
  getByName(
    @Param('name') name: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.promptsService.getPromptByName(name, projectId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.promptsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updatePromptDto: UpdatePromptDto,
  ) {
    return this.promptsService.update(id, updatePromptDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.promptsService.remove(id);
  }
}

@Controller('projects/:projectId/prompts')
export class ProjectPromptsController {
  constructor(private readonly promptsService: PromptsService) {}

  @Get()
  findProjectPrompts(@Param('projectId') projectId: string) {
    return this.promptsService.findByProject(projectId);
  }

  @Get('by-name/:name')
  getProjectPromptByName(
    @Param('projectId') projectId: string,
    @Param('name') name: string,
  ) {
    return this.promptsService.getPromptByNameAndProject(name, projectId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createProjectPrompt(
    @Param('projectId') projectId: string,
    @Body(ValidationPipe) createPromptDto: CreatePromptDto,
  ) {
    createPromptDto.projectId = projectId;
    return this.promptsService.create(createPromptDto);
  }
}