import { Module } from '@nestjs/common';
import { CredentialsController } from './credentials.controller';
import { CredentialsService } from './credentials.service';
import { GitModule } from '../git/git.module';
import { DatabaseModule } from '../modules/database/database.module';
import { JiraModule } from '../modules/jira/jira.module';

@Module({
  imports: [
    GitModule,
    DatabaseModule,
    JiraModule, // For Jira credentials
  ],
  controllers: [CredentialsController],
  providers: [CredentialsService],
  exports: [CredentialsService],
})
export class CredentialsModule {}