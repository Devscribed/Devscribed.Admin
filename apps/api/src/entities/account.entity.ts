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

  /**
   * IANA timezone auto-detected from the browser at signup (spec 01). Source for
   * how dates are displayed to this user elsewhere (specs 06/07).
   */
  @Column({ type: 'varchar', name: 'timezone', length: 64, nullable: true })
  timezone: string | null;

  /**
   * Random GUID revocation stamp (spec 02, requirement 12). Regenerated to
   * revoke all existing sessions (password reset, member removal, password
   * change). The session token carries the stamp it was issued with; the auth
   * guard rejects tokens whose stamp no longer matches.
   */
  @Column({ type: 'uuid', name: 'security_stamp' })
  securityStamp: string;

  @OneToMany(() => Membership, (membership) => membership.account)
  memberships: Membership[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
