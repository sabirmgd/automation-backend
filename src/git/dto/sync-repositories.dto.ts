import { GitRepository } from '../entities/git-repository.entity';

export class SyncRepositoriesResponseDto {
  repositories: GitRepository[];
  syncedAt: Date;
  credentialsUsed: string[];
  errors: Array<{
    credential: string;
    error: string;
  }>;
  totalRepositories: number;
  successCount: number;
  failureCount: number;
}