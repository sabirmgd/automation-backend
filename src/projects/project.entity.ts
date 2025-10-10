import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Prompt } from '../prompts/prompt.entity';
// TODO: Uncomment when entities are available
// import { JiraAccount } from '../modules/jira/entities/jira-account.entity';
// import { GitRepository } from '../git/entities/git-repository.entity';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status: string;

  @Column({ type: 'date', nullable: true })
  startDate: Date;

  @Column({ type: 'date', nullable: true })
  endDate: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  owner: string;

  @Column({ type: 'varchar', length: 36, unique: true, nullable: true })
  key: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  gitlabId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  jiraKey: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  gitlabUrl: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  jiraUrl: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  localPath: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'simple-array', nullable: true })
  tags: string[];

  @Column({ type: 'text', nullable: true })
  agentNavigationInfo: string;

  @Column({ type: 'text', nullable: true })
  accessToken: string;

  @OneToMany(() => Prompt, (prompt) => prompt.project)
  prompts: Prompt[];

  // TODO: Uncomment when entities are available
  // @OneToMany(() => JiraAccount, (jiraAccount) => jiraAccount.project)
  // jiraAccounts: JiraAccount[];

  // @OneToMany(() => GitRepository, (gitRepository) => gitRepository.project)
  // gitRepositories: GitRepository[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}