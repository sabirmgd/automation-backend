import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface HappySession {
  sessionId: string;
  sessionDir: string;
  inputFile: string;
  outputFile: string;
  statusFile: string;
  pidFile: string;
  status: 'starting' | 'running' | 'stopped' | 'exited' | 'error';
  pid?: number;
}

@Injectable()
export class HappySessionManager {
  private readonly logger = new Logger(HappySessionManager.name);
  private readonly sessionsBaseDir = path.join(os.tmpdir(), 'happy-sessions');

  constructor() {
    // Ensure sessions directory exists
    if (!fs.existsSync(this.sessionsBaseDir)) {
      fs.mkdirSync(this.sessionsBaseDir, { recursive: true });
    }
  }

  /**
   * Get session information
   */
  getSession(sessionId: string): HappySession | null {
    const sessionDir = path.join(this.sessionsBaseDir, sessionId);

    if (!fs.existsSync(sessionDir)) {
      return null;
    }

    const session: HappySession = {
      sessionId,
      sessionDir,
      inputFile: path.join(sessionDir, 'input.txt'),
      outputFile: path.join(sessionDir, 'output.log'),
      statusFile: path.join(sessionDir, 'status.json'),
      pidFile: path.join(sessionDir, 'process.pid'),
      status: 'stopped'
    };

    // Read status
    if (fs.existsSync(session.statusFile)) {
      try {
        const statusData = JSON.parse(fs.readFileSync(session.statusFile, 'utf-8'));
        session.status = statusData.status;
        session.pid = statusData.pid;
      } catch (error) {
        this.logger.error(`Error reading status for session ${sessionId}:`, error);
      }
    }

    return session;
  }

  /**
   * Send a message to a running Happy session
   */
  async sendMessage(sessionId: string, message: string): Promise<boolean> {
    const session = this.getSession(sessionId);

    if (!session) {
      this.logger.error(`Session ${sessionId} not found`);
      return false;
    }

    if (session.status !== 'running') {
      this.logger.error(`Session ${sessionId} is not running (status: ${session.status})`);
      return false;
    }

    try {
      // Append message to input file
      fs.appendFileSync(session.inputFile, message + '\n');
      this.logger.log(`Message sent to session ${sessionId}`);
      return true;
    } catch (error) {
      this.logger.error(`Error sending message to session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Read output from a Happy session
   */
  async readOutput(sessionId: string, fromByte: number = 0): Promise<{ content: string; nextByte: number } | null> {
    const session = this.getSession(sessionId);

    if (!session) {
      this.logger.error(`Session ${sessionId} not found`);
      return null;
    }

    if (!fs.existsSync(session.outputFile)) {
      return { content: '', nextByte: 0 };
    }

    try {
      const stats = fs.statSync(session.outputFile);
      const fileSize = stats.size;

      if (fromByte >= fileSize) {
        // No new content
        return { content: '', nextByte: fileSize };
      }

      // Read new content
      const buffer = Buffer.alloc(fileSize - fromByte);
      const fd = fs.openSync(session.outputFile, 'r');
      fs.readSync(fd, buffer, 0, buffer.length, fromByte);
      fs.closeSync(fd);

      return {
        content: buffer.toString(),
        nextByte: fileSize
      };
    } catch (error) {
      this.logger.error(`Error reading output for session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Kill a Happy session
   */
  async killSession(sessionId: string): Promise<boolean> {
    const session = this.getSession(sessionId);

    if (!session) {
      this.logger.error(`Session ${sessionId} not found`);
      return false;
    }

    if (session.pid && fs.existsSync(session.pidFile)) {
      try {
        const pid = parseInt(fs.readFileSync(session.pidFile, 'utf-8'));

        // Try to kill the process
        process.kill(pid, 'SIGTERM');

        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Force kill if still running
        try {
          process.kill(pid, 0); // Check if still running
          process.kill(pid, 'SIGKILL');
        } catch {
          // Process already dead
        }

        // Update status
        const statusData = {
          status: 'stopped',
          stoppedAt: new Date().toISOString()
        };
        fs.writeFileSync(session.statusFile, JSON.stringify(statusData));

        this.logger.log(`Session ${sessionId} killed`);
        return true;
      } catch (error) {
        this.logger.error(`Error killing session ${sessionId}:`, error);
        return false;
      }
    }

    return false;
  }

  /**
   * Clean up old session files
   */
  async cleanupSession(sessionId: string): Promise<void> {
    const sessionDir = path.join(this.sessionsBaseDir, sessionId);

    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      this.logger.log(`Cleaned up session ${sessionId}`);
    }
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): HappySession[] {
    const sessions: HappySession[] = [];

    if (!fs.existsSync(this.sessionsBaseDir)) {
      return sessions;
    }

    const dirs = fs.readdirSync(this.sessionsBaseDir);

    for (const dir of dirs) {
      const session = this.getSession(dir);
      if (session) {
        sessions.push(session);
      }
    }

    return sessions;
  }
}