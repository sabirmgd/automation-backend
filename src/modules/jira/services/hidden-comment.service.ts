import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HiddenComment } from '../entities/hidden-comment.entity';
import { JiraTicket } from '../entities';
import {
  CreateHiddenCommentDto,
  UpdateHiddenCommentDto,
  HiddenCommentResponseDto
} from '../dto/hidden-comment.dto';

@Injectable()
export class HiddenCommentService {
  constructor(
    @InjectRepository(HiddenComment)
    private readonly hiddenCommentRepository: Repository<HiddenComment>,
    @InjectRepository(JiraTicket)
    private readonly jiraTicketRepository: Repository<JiraTicket>,
  ) {}

  async create(
    ticketId: string,
    dto: CreateHiddenCommentDto
  ): Promise<HiddenCommentResponseDto> {
    const ticket = await this.jiraTicketRepository.findOne({
      where: { id: ticketId }
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
    }

    const comment = this.hiddenCommentRepository.create({
      ...dto,
      ticketId,
      ticket,
      authorName: dto.authorName || dto.authorType,
    });

    const savedComment = await this.hiddenCommentRepository.save(comment);
    return this.toResponseDto(savedComment);
  }

  async findAll(ticketId: string): Promise<HiddenCommentResponseDto[]> {
    const ticket = await this.jiraTicketRepository.findOne({
      where: { id: ticketId }
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
    }

    const comments = await this.hiddenCommentRepository.find({
      where: { ticketId },
      order: { createdAt: 'DESC' },
    });

    return comments.map(comment => this.toResponseDto(comment));
  }

  async update(
    commentId: string,
    dto: UpdateHiddenCommentDto
  ): Promise<HiddenCommentResponseDto> {
    const comment = await this.hiddenCommentRepository.findOne({
      where: { id: commentId }
    });

    if (!comment) {
      throw new NotFoundException(`Comment with ID ${commentId} not found`);
    }

    Object.assign(comment, dto);
    const updatedComment = await this.hiddenCommentRepository.save(comment);
    return this.toResponseDto(updatedComment);
  }

  async delete(commentId: string): Promise<void> {
    const result = await this.hiddenCommentRepository.delete(commentId);

    if (result.affected === 0) {
      throw new NotFoundException(`Comment with ID ${commentId} not found`);
    }
  }

  private toResponseDto(comment: HiddenComment): HiddenCommentResponseDto {
    return {
      id: comment.id,
      ticketId: comment.ticketId,
      content: comment.content,
      authorType: comment.authorType,
      authorName: comment.authorName,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }
}