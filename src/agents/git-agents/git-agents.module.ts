import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BranchNameGeneratorService } from './branch-name-generator/agent.service';

@Module({
  imports: [ConfigModule],
  providers: [BranchNameGeneratorService],
  exports: [BranchNameGeneratorService],
})
export class GitAgentsModule {}