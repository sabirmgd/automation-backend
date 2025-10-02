import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { GitRepository } from './git-repository.entity';

@Entity('releases')
export class Release {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column()
  fromBranch: string;

  @Column()
  toBranch: string;

  @ManyToMany(() => GitRepository, { eager: true })
  @JoinTable({
    name: 'release_repositories',
    joinColumn: { name: 'release_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'repository_id', referencedColumnName: 'id' },
  })
  repositories: GitRepository[];

  @Column({ nullable: true })
  prTitleTemplate?: string;

  @Column({ nullable: true, type: 'text' })
  prDescriptionTemplate?: string;

  @Column({ nullable: true })
  lastExecutedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}