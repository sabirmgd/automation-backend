import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { LinkTaskDto, UnlinkTaskDto } from './dto/link-task.dto';
import { TaskFilterDto } from './dto/task-filter.dto';
import { TaskStatus } from './entities/task.entity';

@Controller('projects/:projectId/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('projectId') projectId: string,
    @Body(ValidationPipe) createTaskDto: CreateTaskDto,
  ) {
    createTaskDto.projectId = projectId;
    return this.tasksService.create(createTaskDto);
  }

  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @Query(ValidationPipe) filterDto: TaskFilterDto,
  ) {
    filterDto.projectId = projectId;
    return this.tasksService.findByProject(projectId, filterDto);
  }

  @Get(':taskId')
  findOne(@Param('taskId') taskId: string) {
    return this.tasksService.findOne(taskId);
  }

  @Patch(':taskId')
  update(
    @Param('taskId') taskId: string,
    @Body(ValidationPipe) updateTaskDto: UpdateTaskDto,
  ) {
    return this.tasksService.update(taskId, updateTaskDto);
  }

  @Delete(':taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('taskId') taskId: string) {
    return this.tasksService.remove(taskId);
  }

  @Post(':taskId/links')
  @HttpCode(HttpStatus.CREATED)
  addLink(
    @Param('taskId') taskId: string,
    @Body(ValidationPipe) linkTaskDto: LinkTaskDto,
  ) {
    return this.tasksService.addLink(taskId, linkTaskDto);
  }

  @Delete(':taskId/links')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeLink(
    @Param('taskId') taskId: string,
    @Body(ValidationPipe) unlinkTaskDto: UnlinkTaskDto,
  ) {
    return this.tasksService.removeLink(taskId, unlinkTaskDto);
  }

  @Get(':taskId/links')
  getLinks(@Param('taskId') taskId: string) {
    return this.tasksService.getLinks(taskId);
  }

  @Patch(':taskId/status')
  updateStatus(
    @Param('taskId') taskId: string,
    @Body('status') status: TaskStatus,
  ) {
    return this.tasksService.updateTaskStatus(taskId, status);
  }

  @Post('bulk-update-status')
  bulkUpdateStatus(
    @Body('taskIds') taskIds: string[],
    @Body('status') status: TaskStatus,
  ) {
    return this.tasksService.bulkUpdateStatus(taskIds, status);
  }
}