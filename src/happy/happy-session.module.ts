import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HappySession } from './entities/happy-session.entity';
import { HappySessionService } from './happy-session.service';
import { HappySessionController } from './happy-session.controller';

@Module({
  imports: [TypeOrmModule.forFeature([HappySession])],
  controllers: [HappySessionController],
  providers: [HappySessionService],
  exports: [HappySessionService],
})
export class HappySessionModule {}