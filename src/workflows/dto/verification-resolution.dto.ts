import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsUUID } from 'class-validator';

export enum ResolutionMode {
  CONTEXT = 'context',
  IMPLEMENTATION = 'implementation',
}

export enum ResolutionStatus {
  NOT_STARTED = 'not_started',
  CONTEXT_SENT = 'context_sent',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export class StartVerificationResolutionDto {
  @ApiProperty({
    enum: ResolutionMode,
    description: 'Mode for resolution: context or implementation',
  })
  @IsEnum(ResolutionMode)
  mode: ResolutionMode;

  @ApiProperty({
    required: false,
    description: 'Additional instructions for the resolution',
  })
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiProperty({
    required: false,
    description: 'Specific verification ID to resolve (defaults to latest)',
  })
  @IsOptional()
  @IsUUID()
  verificationId?: string;
}

export class VerificationResolutionStatusDto {
  @ApiProperty({
    enum: ResolutionStatus,
    description: 'Current status of the resolution',
  })
  status: ResolutionStatus;

  @ApiProperty({
    required: false,
    description: 'Happy session ID for the resolution',
  })
  sessionId?: string;

  @ApiProperty({
    required: false,
    description: 'Resume commands for continuing the resolution',
  })
  resumeCommands?: {
    cd: string;
    happy: string;
  };

  @ApiProperty({
    required: false,
    description: 'Resolution metadata',
  })
  metadata?: {
    mode?: 'context' | 'implementation';
    startedAt?: Date;
    completedAt?: Date;
    verificationId?: string;
    resolutionNotes?: string;
    additionalInstructions?: string;
    initialResponse?: string;
  };

  @ApiProperty({
    description: 'ID of the verification being resolved',
  })
  verificationId: string;

  @ApiProperty({
    description: 'Worktree path for the resolution',
    required: false,
  })
  worktreePath?: string;
}

export class CompleteVerificationResolutionDto {
  @ApiProperty({
    required: false,
    description: 'Notes about the resolution completion',
  })
  @IsOptional()
  @IsString()
  completionNotes?: string;
}