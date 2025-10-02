import { IsArray, IsString, IsUUID, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ApproveCommentsDto {
  @ApiProperty({ description: 'Array of comment IDs to approve', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  commentIds: string[];

  @ApiProperty({ description: 'Username of the approver' })
  @IsString()
  approvedBy: string;
}