import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ReviewService } from '../services/review.service';
import { CreateReviewDto } from '../dto/create-review.dto';
import { ApproveCommentsDto } from '../dto/approve-comments.dto';
import { PostCommentsDto } from '../dto/post-comments.dto';
import { ReviewComment } from '../entities/review-comment.entity';

@ApiTags('Review')
@Controller('git/review')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate AI review for a pull request' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Review generated successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Pull request not found' })
  async generateReview(@Body() dto: CreateReviewDto) {
    return this.reviewService.generateReview(dto);
  }

  @Get('pull-request/:pullRequestId/comments')
  @ApiOperation({ summary: 'Get review comments for a pull request' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Comments retrieved successfully', type: [ReviewComment] })
  @ApiQuery({ name: 'approved', required: false, type: Boolean })
  @ApiQuery({ name: 'posted', required: false, type: Boolean })
  @ApiQuery({ name: 'severity', required: false, type: String })
  @ApiQuery({ name: 'suggestionType', required: false, type: String })
  @ApiQuery({ name: 'reviewSessionId', required: false, type: String })
  async getReviewComments(
    @Param('pullRequestId') pullRequestId: string,
    @Query('approved') approved?: boolean,
    @Query('posted') posted?: boolean,
    @Query('severity') severity?: string,
    @Query('suggestionType') suggestionType?: string,
    @Query('reviewSessionId') reviewSessionId?: string,
  ) {
    const filters = {
      approved: approved !== undefined ? approved === true : undefined,
      posted: posted !== undefined ? posted === true : undefined,
      severity,
      suggestionType,
      reviewSessionId,
    };

    return this.reviewService.getReviewComments(pullRequestId, filters);
  }

  @Patch('comments/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve review comments' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Comments approved successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Comments not found' })
  async approveComments(@Body() dto: ApproveCommentsDto) {
    return this.reviewService.approveComments(dto);
  }

  @Post('comments/post')
  @ApiOperation({ summary: 'Post approved comments to git provider' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Comments posted successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Pull request not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid request' })
  async postComments(@Body() dto: PostCommentsDto) {
    return this.reviewService.postComments(dto);
  }

  @Get('pull-request/:pullRequestId/summary')
  @ApiOperation({ summary: 'Get review summary for a pull request' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Summary retrieved successfully' })
  async getReviewSummary(@Param('pullRequestId') pullRequestId: string) {
    return this.reviewService.getReviewSummary(pullRequestId);
  }

  @Delete('comments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete review comments (only unposted)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Comments deleted successfully' })
  async deleteComments(@Body('commentIds') commentIds: string[]) {
    return this.reviewService.deleteComments(commentIds);
  }
}