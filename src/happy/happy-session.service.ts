import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { spawn, ChildProcess } from 'child_process';
import { HappySession, HappySessionStatus } from './entities/happy-session.entity';
import { randomUUID } from 'crypto';

@Injectable()
export class HappySessionService implements OnModuleDestroy {
  private readonly logger = new Logger(HappySessionService.name);
  private runningProcesses: Map<string, ChildProcess> = new Map();

  constructor(
    @InjectRepository(HappySession)
    private readonly happySessionRepository: Repository<HappySession>,
  ) {
    this.recoverOrphanedSessions();
  }

  async onModuleDestroy() {
    this.logger.log('Cleaning up Happy sessions...');
    await this.stopAllSessions();
  }

  async startSession(params: {
    projectId?: string;
    ticketId?: string;
    workingDirectory?: string;
    resumeSessionId?: string;
  }): Promise<HappySession> {
    const sessionId = params.resumeSessionId || randomUUID();
    const cwd = params.workingDirectory || process.cwd();

    // Create database record
    const happySession = this.happySessionRepository.create({
      sessionId,
      projectId: params.projectId,
      ticketId: params.ticketId,
      workingDirectory: cwd,
      status: HappySessionStatus.STARTING,
      metadata: {
        resumedFrom: params.resumeSessionId || null,
      },
    });

    await this.happySessionRepository.save(happySession);

    try {
      // Build Happy command
      const args = [];
      if (params.resumeSessionId) {
        args.push('resume', params.resumeSessionId);
      }
      args.push('--yolo'); // bypass permissions
      args.push('--session-id', sessionId);

      this.logger.log(`Starting Happy session: ${sessionId}`);
      this.logger.log(`Command: happy ${args.join(' ')}`);

      // Spawn Happy process in background
      const happyProcess = spawn('happy', args, {
        cwd,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      // Store process reference
      this.runningProcesses.set(sessionId, happyProcess);

      // Update session with process ID
      happySession.processId = happyProcess.pid;
      happySession.status = HappySessionStatus.RUNNING;
      await this.happySessionRepository.save(happySession);

      // Log output for debugging
      happyProcess.stdout?.on('data', (data) => {
        this.logger.debug(`Happy session ${sessionId} stdout: ${data}`);
      });

      happyProcess.stderr?.on('data', (data) => {
        this.logger.warn(`Happy session ${sessionId} stderr: ${data}`);
      });

      // Handle process exit
      happyProcess.on('exit', async (code, signal) => {
        this.logger.log(`Happy session ${sessionId} exited with code ${code} and signal ${signal}`);
        this.runningProcesses.delete(sessionId);

        const updatedSession = await this.happySessionRepository.findOne({
          where: { sessionId },
        });

        if (updatedSession) {
          updatedSession.status = code === 0 ? HappySessionStatus.STOPPED : HappySessionStatus.CRASHED;
          updatedSession.stoppedAt = new Date();
          updatedSession.metadata = {
            ...updatedSession.metadata,
            exitCode: code,
            signal,
          };
          await this.happySessionRepository.save(updatedSession);
        }
      });

      happyProcess.on('error', async (err) => {
        this.logger.error(`Happy session ${sessionId} error: ${err.message}`);
        this.runningProcesses.delete(sessionId);

        const updatedSession = await this.happySessionRepository.findOne({
          where: { sessionId },
        });

        if (updatedSession) {
          updatedSession.status = HappySessionStatus.CRASHED;
          updatedSession.stoppedAt = new Date();
          updatedSession.metadata = {
            ...updatedSession.metadata,
            error: err.message,
          };
          await this.happySessionRepository.save(updatedSession);
        }
      });

      // Give it a moment to ensure it started
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if process is still running
      if (!this.runningProcesses.has(sessionId)) {
        throw new Error('Happy session failed to start');
      }

      this.logger.log(`Happy session ${sessionId} started successfully with PID ${happyProcess.pid}`);
      return happySession;

    } catch (error) {
      this.logger.error(`Failed to start Happy session: ${error.message}`);

      happySession.status = HappySessionStatus.CRASHED;
      happySession.stoppedAt = new Date();
      happySession.metadata = {
        ...happySession.metadata,
        error: error.message,
      };
      await this.happySessionRepository.save(happySession);

      throw error;
    }
  }

  async stopSession(sessionId: string): Promise<HappySession> {
    const session = await this.happySessionRepository.findOne({
      where: { sessionId },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const process = this.runningProcesses.get(sessionId);

    if (process) {
      this.logger.log(`Stopping Happy session ${sessionId} with PID ${process.pid}`);

      try {
        // Try graceful shutdown first
        process.kill('SIGTERM');

        // Wait a bit for graceful shutdown
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Force kill if still running
        if (this.runningProcesses.has(sessionId)) {
          process.kill('SIGKILL');
        }

        this.runningProcesses.delete(sessionId);
      } catch (error) {
        this.logger.error(`Error killing process: ${error.message}`);
      }
    }

    // Update database
    session.status = HappySessionStatus.STOPPED;
    session.stoppedAt = new Date();
    await this.happySessionRepository.save(session);

    this.logger.log(`Happy session ${sessionId} stopped`);
    return session;
  }

  async getSessionStatus(sessionId: string): Promise<HappySession> {
    const session = await this.happySessionRepository.findOne({
      where: { sessionId },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Check if process is actually running
    const process = this.runningProcesses.get(sessionId);
    if (session.status === HappySessionStatus.RUNNING && !process) {
      // Process died unexpectedly
      session.status = HappySessionStatus.CRASHED;
      session.stoppedAt = new Date();
      await this.happySessionRepository.save(session);
    }

    return session;
  }

  async listSessions(filters?: {
    projectId?: string;
    ticketId?: string;
    status?: HappySessionStatus;
  }): Promise<HappySession[]> {
    const query = this.happySessionRepository.createQueryBuilder('session');

    if (filters?.projectId) {
      query.andWhere('session.projectId = :projectId', { projectId: filters.projectId });
    }

    if (filters?.ticketId) {
      query.andWhere('session.ticketId = :ticketId', { ticketId: filters.ticketId });
    }

    if (filters?.status) {
      query.andWhere('session.status = :status', { status: filters.status });
    }

    query.orderBy('session.startedAt', 'DESC');

    return query.getMany();
  }

  async getActiveSessionForTicket(ticketId: string): Promise<HappySession | null> {
    return this.happySessionRepository.findOne({
      where: {
        ticketId,
        status: HappySessionStatus.RUNNING,
      },
      order: {
        startedAt: 'DESC',
      },
    });
  }

  private async stopAllSessions(): Promise<void> {
    const promises = Array.from(this.runningProcesses.keys()).map((sessionId) =>
      this.stopSession(sessionId).catch((err) => {
        this.logger.error(`Failed to stop session ${sessionId}: ${err.message}`);
      }),
    );

    await Promise.all(promises);
  }

  private async recoverOrphanedSessions(): Promise<void> {
    // Mark all running sessions as crashed on startup
    // (they're orphaned from a previous server instance)
    const runningSessions = await this.happySessionRepository.find({
      where: { status: HappySessionStatus.RUNNING },
    });

    if (runningSessions.length > 0) {
      this.logger.warn(`Found ${runningSessions.length} orphaned sessions, marking as crashed`);

      for (const session of runningSessions) {
        session.status = HappySessionStatus.CRASHED;
        session.stoppedAt = new Date();
        session.metadata = {
          ...session.metadata,
          recoveredAsOrphaned: true,
        };
        await this.happySessionRepository.save(session);
      }
    }
  }
}