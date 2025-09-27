import { Injectable } from '@nestjs/common';

@Injectable()
export class EncryptionService {
  encrypt(text: string): string {
    // Simple base64 encoding - in production, use proper encryption
    return Buffer.from(text).toString('base64');
  }

  decrypt(encryptedText: string): string {
    // Simple base64 decoding - in production, use proper decryption
    return Buffer.from(encryptedText, 'base64').toString('utf-8');
  }
}