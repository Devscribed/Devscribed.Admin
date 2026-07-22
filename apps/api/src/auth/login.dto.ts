import type { LoginInput } from '@devscribed/validation';

/** Raw request body; every rule lives in `@devscribed/validation`. */
export type LoginDto = Partial<LoginInput>;
