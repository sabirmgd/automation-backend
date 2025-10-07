import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common/common.module';
import { ClientsModule } from './clients/clients.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { GitModule } from './git/git.module';
import { JiraModule } from './modules/jira/jira.module';
import { TasksModule } from './tasks/tasks.module';
import { CronsModule } from './crons/crons.module';
import { CommandModule } from './clients/command/command.module';
import { CredentialsModule } from './credentials/credentials.module';
import { PromptsModule } from './prompts/prompts.module';
import { CodeModule } from './code/code.module';
import { HappySessionModule } from './happy/happy-session.module';
import { TicketWorkflowModule } from './workflows/ticket-workflow.module';
import configuration from './config';
import { validationSchema } from './config/validation.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configuration,
      validationSchema: validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
      expandVariables: true,
      cache: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const dbConfig = configService.get('database');
        console.log('Database Config:', {
          ...dbConfig,
          password: dbConfig.password ? `[${dbConfig.password.length} chars]` : 'undefined'
        });
        console.log('Actual password:', dbConfig.password);
        return dbConfig;
      },
      inject: [ConfigService],
    }),
    CommonModule,
    CommandModule,
    AuthModule,
    ClientsModule,
    ProjectsModule,
    PromptsModule,
    GitModule,
    CredentialsModule,
    JiraModule,
    TasksModule,
    CronsModule,
    CodeModule,
    HappySessionModule,
    TicketWorkflowModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}