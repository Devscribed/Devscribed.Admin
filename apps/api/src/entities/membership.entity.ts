import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MembershipStatus, Role } from '@devscribed/shared';
import { Account } from './account.entity';
import { Organization } from './organization.entity';

/**
 * Links an {@link Account} to an {@link Organization} with a role and status
 * (specs 01, 03, 05).
 *
 * The partial unique index enforces the single-organization-per-account model
 * (spec 01, requirement 7): an account may hold at most one `active` membership.
 * A `removed` membership does not occupy that slot.
 */
@Entity('memberships')
@Index('UQ_active_membership_per_account', ['accountId'], {
  unique: true,
  where: `"status" = 'active'`,
})
export class Membership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'account_id' })
  accountId: string;

  @ManyToOne(() => Account, (account) => account.memberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, (organization) => organization.memberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'enum', enum: Role, enumName: 'membership_role' })
  role: Role;

  @Column({
    type: 'enum',
    enum: MembershipStatus,
    enumName: 'membership_status',
    default: MembershipStatus.Active,
  })
  status: MembershipStatus;

  @Column({ type: 'timestamptz', name: 'joined_at' })
  joinedAt: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
