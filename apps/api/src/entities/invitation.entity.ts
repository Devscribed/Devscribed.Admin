import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { InvitationStatus, Role } from '@devscribed/shared';
import { Organization } from './organization.entity';
import { Membership } from './membership.entity';

/**
 * A pending invitation to join an organization (spec 03). Only the SHA-256 hash
 * of the emailed token is stored; the raw token lives only in the accept link.
 */
@Entity('invitations')
// Supersession lookup: at most one live pending invite per (email, org).
@Index('IDX_pending_invitation_email_org', ['email', 'organizationId'], {
  where: `"status" = 'pending'`,
})
export class Invitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Normalized (lowercase) invitee email. */
  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ type: 'enum', enum: Role, enumName: 'membership_role' })
  role: Role;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Index('IDX_invitations_inviter_membership')
  @Column({ type: 'uuid', name: 'inviter_membership_id' })
  inviterMembershipId: string;

  @ManyToOne(() => Membership, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inviter_membership_id' })
  inviterMembership: Membership;

  @Index('UQ_invitations_token_hash', { unique: true })
  @Column({ type: 'varchar', length: 64, name: 'token_hash' })
  tokenHash: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({
    type: 'enum',
    enum: InvitationStatus,
    enumName: 'invitation_status',
    default: InvitationStatus.Pending,
  })
  status: InvitationStatus;

  @Column({ type: 'timestamptz', name: 'used_at', nullable: true })
  usedAt: Date | null;
}
