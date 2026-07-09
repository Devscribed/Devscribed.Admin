import {
  isValidEmail,
  normalizeEmail,
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
}

/** Per-field validation errors keyed by field name (drives `field-error-{field}`). */
export type SignupErrors = Record<string, string>;

/**
 * Validate and normalize a signup payload against the shared rules (specs 01, 02).
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

  const firstName = (dto.firstName ?? '').trim();
  if (firstName.length === 0) {
    errors.firstName = 'first name is required';
  }

  const lastName = (dto.lastName ?? '').trim();
  if (lastName.length === 0) {
    errors.lastName = 'last name is required';
  }

  const email = normalizeEmail(dto.email ?? '');
  if (!isValidEmail(email)) {
    errors.email = 'a valid email is required';
  }

  const password = validatePassword(dto.password ?? '');
  if (!password.valid) {
    errors.password = password.error;
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    errors: null,
    data: {
      orgName: org.valid ? org.value : '',
      firstName,
      lastName,
      email,
      password: dto.password,
    },
  };
}
