export interface PasswordResetEmail {
  to: string;
  firstName: string;
  /** The raw token — this is the only place outside the email that ever holds it. */
  token: string;
  /** Fully-formed link the recipient clicks. */
  resetUrl: string;
}

/** Spec 03. */
export interface InvitationEmail {
  to: string;
  organizationName: string;
  role: string;
  /** The raw token — this is the only place outside the email that ever holds it. */
  token: string;
  /** Fully-formed link the recipient clicks. */
  acceptUrl: string;
}

/**
 * Transport-agnostic outbound mail. Spec 02 defines the contract, not the transport:
 * the real sender is out of scope, so this stays abstract and is swapped per
 * environment — a console logger in dev, an in-memory sink in tests.
 *
 * Used as the DI token directly, which is why it is an abstract class and not an
 * interface.
 */
export abstract class MailService {
  abstract sendPasswordReset(message: PasswordResetEmail): Promise<void>;
  abstract sendInvitation(message: InvitationEmail): Promise<void>;
}
