import { Controller, Post, Get, Param, Body, Query, HttpException, HttpStatus } from '@nestjs/common';
import { HappySessionService } from './happy-session.service';
import { StartSessionDto } from './dto/start-session.dto';
import { HappySessionStatus } from './entities/happy-session.entity';

@Controller('happy/sessions')
export class HappySessionController {
  constructor(private readonly happySessionService: HappySessionService) {}

  @Post('start')
  async startSession(@Body() dto: StartSessionDto) {
    try {
      return await this.happySessionService.startSession(dto);
    } catch (error) {
      throw new HttpException(
        `Failed to start Happy session: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':sessionId/stop')
  async stopSession(@Param('sessionId') sessionId: string) {
    try {
      return await this.happySessionService.stopSession(sessionId);
    } catch (error) {
      if (error.message.includes('not found')) {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      throw new HttpException(
        `Failed to stop Happy session: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':sessionId/status')
  async getSessionStatus(@Param('sessionId') sessionId: string) {
    try {
      return await this.happySessionService.getSessionStatus(sessionId);
    } catch (error) {
      if (error.message.includes('not found')) {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      throw new HttpException(
        `Failed to get session status: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  async listSessions(
    @Query('projectId') projectId?: string,
    @Query('ticketId') ticketId?: string,
    @Query('status') status?: HappySessionStatus,
  ) {
    return await this.happySessionService.listSessions({
      projectId,
      ticketId,
      status,
    });
  }

  @Get('ticket/:ticketId/active')
  async getActiveSessionForTicket(@Param('ticketId') ticketId: string) {
    const session = await this.happySessionService.getActiveSessionForTicket(ticketId);
    if (!session) {
      throw new HttpException(
        `No active session found for ticket ${ticketId}`,
        HttpStatus.NOT_FOUND,
      );
    }
    return session;
  }
}