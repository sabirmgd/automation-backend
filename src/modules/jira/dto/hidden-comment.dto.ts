import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { AuthorType } from '../entities/hidden-comment.entity';

export class CreateHiddenCommentDto {
  @IsNotEmpty()
  @IsString()
  content: string;

  @IsEnum(AuthorType)
  authorType: AuthorType;

  @IsOptional()
  @IsString()
  authorName?: string;
}

export class UpdateHiddenCommentDto {
  @IsOptional()
  @IsString()
  content?: string;
}

export class HiddenCommentResponseDto {
  id: string;
  ticketId: string;
  content: string;
  authorType: AuthorType;
  authorName: string;
  sessionId?: string;
  createdAt: Date;
  updatedAt: Date;
}