import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  JiraAccount,
  JiraBoard,
  JiraTicket,
  JiraUser,
  JiraProject,
  TicketAnalysis,
} from './entities';
import { JiraAccountService } from './services/jira-account.service';
import { JiraTicketService } from './services/jira-ticket.service';
import { TicketAnalysisService } from './services/ticket-analysis.service';
import { JiraSyncService } from './services/jira-sync.service';
import { JiraAccountController } from './controllers/jira-account.controller';
import { JiraTicketController } from './controllers/jira-ticket.controller';
import { TicketAnalysisController } from './controllers/ticket-analysis.controller';
import { EncryptionService } from '../../common/services/encryption.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      JiraAccount,
      JiraBoard,
      JiraTicket,
      JiraUser,
      JiraProject,
      TicketAnalysis,
    ]),
  ],
  controllers: [
    JiraAccountController,
    JiraTicketController,
    TicketAnalysisController,
  ],
  providers: [
    JiraAccountService,
    JiraTicketService,
    TicketAnalysisService,
    JiraSyncService,
    EncryptionService,
  ],
  exports: [
    JiraAccountService,
    JiraTicketService,
    TicketAnalysisService,
    JiraSyncService,
  ],
})
export class JiraModule {}