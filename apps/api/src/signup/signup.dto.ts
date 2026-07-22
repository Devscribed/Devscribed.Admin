import type { SignupInput } from '@devscribed/validation';

/**
 * Raw request body. Deliberately untyped-but-shaped: every rule lives in
 * `@devscribed/validation`, so there is exactly one place a message can change.
 */
export type SignupDto = Partial<SignupInput>;
