import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { HiddenCommentService } from '../services/hidden-comment.service';
import {
  CreateHiddenCommentDto,
  UpdateHiddenCommentDto,
  HiddenCommentResponseDto,
} from '../dto/hidden-comment.dto';

@Controller('api/jira')
export class HiddenCommentController {
  constructor(private readonly hiddenCommentService: HiddenCommentService) {}

  @Post('tickets/:ticketId/hidden-comments')
  async create(
    @Param('ticketId') ticketId: string,
    @Body(ValidationPipe) dto: CreateHiddenCommentDto
  ): Promise<HiddenCommentResponseDto> {
    return await this.hiddenCommentService.create(ticketId, dto);
  }

  @Get('tickets/:ticketId/hidden-comments')
  async findAll(
    @Param('ticketId') ticketId: string
  ): Promise<HiddenCommentResponseDto[]> {
    return await this.hiddenCommentService.findAll(ticketId);
  }

  @Put('hidden-comments/:commentId')
  async update(
    @Param('commentId') commentId: string,
    @Body(ValidationPipe) dto: UpdateHiddenCommentDto
  ): Promise<HiddenCommentResponseDto> {
    return await this.hiddenCommentService.update(commentId, dto);
  }

  @Delete('hidden-comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('commentId') commentId: string): Promise<void> {
    await this.hiddenCommentService.delete(commentId);
  }
}