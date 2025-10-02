import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {
  // In a real application, you would have user validation logic here.
  // For example, fetching a user from the database.
  async validateUser(payload: any) {
    // For now, we'll just return the payload.
    return { userId: payload.sub, username: payload.username };
  }
}

