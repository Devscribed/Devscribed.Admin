// Client-side mirror of the server-side validation rules in
// src/Devscribed.Admin.Domain/Validation. Keep the messages and thresholds in sync with
// specs/user-management/01-organization-creation.md, requirement 14.

export type FieldValidationResult = {
  isValid: boolean;
  errorMessage?: string;
  normalizedValue?: string;
};

const NAME_CHARACTERS = /^[A-Za-z\-' ]+$/;
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function valid(normalizedValue: string): FieldValidationResult {
  return { isValid: true, normalizedValue };
}

function invalid(errorMessage: string): FieldValidationResult {
  return { isValid: false, errorMessage };
}

export function validateOrganizationName(value: string): FieldValidationResult {
  const trimmed = value.trim();

  if (trimmed.length === 0) return invalid("Organization name is required");
  if (trimmed.length > 100) return invalid("Organization name must be at most 100 characters");

  return valid(trimmed);
}

export function validatePersonName(value: string, fieldLabel: string): FieldValidationResult {
  const trimmed = value.trim();

  if (trimmed.length === 0) return invalid(`${fieldLabel} is required`);
  if (trimmed.length > 50) return invalid(`${fieldLabel} must be at most 50 characters`);
  if (!NAME_CHARACTERS.test(trimmed))
    return invalid(`${fieldLabel} may contain only letters, hyphens, apostrophes, and spaces`);

  return valid(trimmed);
}

export function validateEmail(value: string): FieldValidationResult {
  const trimmed = value.trim();

  if (trimmed.length === 0) return invalid("Email is required");
  if (!EMAIL_FORMAT.test(trimmed)) return invalid("Enter a valid email address");
  if (trimmed.length > 254) return invalid("Email must be at most 254 characters");

  return valid(trimmed.toLowerCase());
}

export function validatePassword(value: string): FieldValidationResult {
  if (value.length === 0) return invalid("Password is required");
  if (value.length < 8) return invalid("Password must be at least 8 characters");
  if (value.length > 128) return invalid("Password must be at most 128 characters");
  if (!/[A-Za-z]/.test(value)) return invalid("Password must contain at least one letter");
  if (!/[0-9]/.test(value)) return invalid("Password must contain at least one digit");

  return valid(value);
}

export type SignupFieldName = "orgName" | "firstName" | "lastName" | "email" | "password";

export function validateSignupField(field: SignupFieldName, value: string): FieldValidationResult {
  switch (field) {
    case "orgName":
      return validateOrganizationName(value);
    case "firstName":
      return validatePersonName(value, "First name");
    case "lastName":
      return validatePersonName(value, "Last name");
    case "email":
      return validateEmail(value);
    case "password":
      return validatePassword(value);
  }
}
