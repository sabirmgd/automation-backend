import { Module, Global } from '@nestjs/common';
import { CommandClient } from './command.client';
import { CommandController } from './command.controller';

@Global()
@Module({
  controllers: [CommandController],
  providers: [CommandClient],
  exports: [CommandClient],
})
export class CommandModule {}