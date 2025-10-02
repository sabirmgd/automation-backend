import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseCredential } from './entities/database-credential.entity';
import { DatabaseCredentialService } from './services/database-credential.service';
import { DatabaseConnectionService } from './services/database-connection.service';
import { DatabaseCredentialController } from './controllers/database-credential.controller';
import { EncryptionService } from '../../common/services/encryption.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DatabaseCredential]),
  ],
  controllers: [DatabaseCredentialController],
  providers: [
    DatabaseCredentialService,
    DatabaseConnectionService,
    EncryptionService,
  ],
  exports: [
    DatabaseCredentialService,
    DatabaseConnectionService,
  ],
})
export class DatabaseModule {}