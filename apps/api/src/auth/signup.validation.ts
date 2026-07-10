import {
  normalizeEmail,
  validateEmail,
  validateName,
  validateOrgName,
  validatePassword,
} from '@devscribed/shared';
import { SignupDto } from './dto/signup.dto';

/** Signup input after normalization (trimmed names/org, lowercased email). */
export interface NormalizedSignup {
  orgName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  timezone: string;
}

/** Per-field validation errors keyed by field name (drives `field-error-{field}`). */
export type SignupErrors = Record<string, string>;

const DEFAULT_TIMEZONE = 'UTC';

/**
 * Validate and normalize a signup payload against the shared rules (spec 01).
 * Returns either a map of field errors or the normalized data — never both.
 */
export function validateSignup(
  dto: SignupDto,
): { errors: SignupErrors } | { errors: null; data: NormalizedSignup } {
  const errors: SignupErrors = {};

  const org = validateOrgName(dto.orgName ?? '');
  if (!org.valid) {
    errors.orgName = org.error;
  }

  const firstName = validateName(dto.firstName ?? '', 'First name');
  if (!firstName.valid) {
    errors.firstName = firstName.error;
  }

  const lastName = validateName(dto.lastName ?? '', 'Last name');
  if (!lastName.valid) {
    errors.lastName = lastName.error;
  }

  const email = validateEmail(dto.email ?? '');
  if (!email.valid) {
    errors.email = email.error;
  }

  const password = validatePassword(dto.password ?? '');
  if (!password.valid) {
    errors.password = password.error;
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const timezone = (dto.timezone ?? '').trim() || DEFAULT_TIMEZONE;

  return {
    errors: null,
    data: {
      orgName: org.valid ? org.value : '',
      firstName: firstName.valid ? firstName.value : '',
      lastName: lastName.valid ? lastName.value : '',
      email: normalizeEmail(email.valid ? email.value : ''),
      password: dto.password,
      timezone,
    },
  };
}
