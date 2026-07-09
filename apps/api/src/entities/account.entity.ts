import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Membership } from './membership.entity';

/**
 * A login account (spec 01). Holds credentials and profile name. Email is stored
 * lowercased/normalized and is unique across all accounts.
 */
@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('UQ_accounts_email', { unique: true })
  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({ type: 'varchar', name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'varchar', name: 'first_name', length: 200 })
  firstName: string;

  @Column({ type: 'varchar', name: 'last_name', length: 200 })
  lastName: string;

  @OneToMany(() => Membership, (membership) => membership.account)
  memberships: Membership[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
