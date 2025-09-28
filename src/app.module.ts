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
      useFactory: (configService: ConfigService) => ({
        ...configService.get('database'),
      }),
      inject: [ConfigService],
    }),
    CommonModule,
    CommandModule,
    AuthModule,
    ClientsModule,
    ProjectsModule,
    GitModule,
    JiraModule,
    TasksModule,
    CronsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}