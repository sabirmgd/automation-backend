import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  JiraAccount,
  JiraBoard,
  JiraTicket,
  JiraUser,
  JiraProject,
  TicketAnalysis,
  HiddenComment,
} from './entities';
import { JiraAccountService } from './services/jira-account.service';
import { JiraTicketService } from './services/jira-ticket.service';
import { TicketAnalysisService } from './services/ticket-analysis.service';
import { JiraSyncService } from './services/jira-sync.service';
import { JiraBoardService } from './services/jira-board.service';
import { HiddenCommentService } from './services/hidden-comment.service';
import { JiraAccountController } from './controllers/jira-account.controller';
import { JiraTicketController } from './controllers/jira-ticket.controller';
import { TicketAnalysisController } from './controllers/ticket-analysis.controller';
import { HiddenCommentController } from './controllers/hidden-comment.controller';
import { TicketImproverController } from './controllers/ticket-improver.controller';
import { JiraImproverAgentService } from '../../agents/jira-improver/agent.service';
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
      HiddenComment,
    ]),
  ],
  controllers: [
    JiraAccountController,
    JiraTicketController,
    TicketAnalysisController,
    HiddenCommentController,
    TicketImproverController,
  ],
  providers: [
    JiraAccountService,
    JiraTicketService,
    TicketAnalysisService,
    JiraSyncService,
    JiraBoardService,
    HiddenCommentService,
    JiraImproverAgentService,
    EncryptionService,
  ],
  exports: [
    JiraAccountService,
    JiraTicketService,
    TicketAnalysisService,
    JiraSyncService,
    JiraBoardService,
    HiddenCommentService,
  ],
})
export class JiraModule {}