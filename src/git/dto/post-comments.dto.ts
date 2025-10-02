import { IsArray, IsUUID, IsOptional, IsBoolean, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PostCommentsDto {
  @ApiProperty({ description: 'Pull request ID' })
  @IsUUID()
  pullRequestId: string;

  @ApiPropertyOptional({ description: 'Specific comment IDs to post', type: [String] })
  @ValidateIf((o) => !o.postAll)
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  commentIds?: string[];

  @ApiPropertyOptional({ description: 'Post all approved comments for this PR', default: false })
  @ValidateIf((o) => !o.commentIds || o.commentIds.length === 0)
  @IsOptional()
  @IsBoolean()
  postAll?: boolean;
}