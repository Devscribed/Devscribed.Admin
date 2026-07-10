/**
 * Candidate/CV validation shared by the client form and the server route, so
 * both enforce the same rules. Client-safe: no server-only imports.
 */

export const ACCEPTED_CV_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".rtf",
  ".txt",
] as const;

export const MAX_CV_BYTES = 10 * 1024 * 1024; // 10 MB

export type CandidateFieldErrors = Partial<
  Record<"firstName" | "lastName" | "email" | "cv", string>
>;

export function isValidEmail(value: string): boolean {
  // Deliberately simple; the authoritative check is delivery.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Lower-cased extension including the dot, or "" if none. */
export function cvExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "" : fileName.slice(dot).toLowerCase();
}

export function isAcceptedCvExtension(fileName: string): boolean {
  return (ACCEPTED_CV_EXTENSIONS as readonly string[]).includes(
    cvExtension(fileName),
  );
}

export interface CvLike {
  name: string;
  size: number;
}

/** Validate a CV file, returning an error message or null if acceptable. */
export function validateCv(cv: CvLike | null): string | null {
  if (!cv || !cv.name) return "Please attach your CV.";
  if (!isAcceptedCvExtension(cv.name)) {
    return `Unsupported file type. Accepted: ${ACCEPTED_CV_EXTENSIONS.join(", ")}.`;
  }
  if (cv.size > MAX_CV_BYTES) return "File is too large (max 10 MB).";
  if (cv.size === 0) return "The attached file is empty.";
  return null;
}

export interface CandidateFieldsInput {
  firstName: string;
  lastName: string;
  email: string;
  cv: CvLike | null;
}

/** Validate all required candidate fields (note is always optional). */
export function validateCandidateFields(
  input: CandidateFieldsInput,
): CandidateFieldErrors {
  const errors: CandidateFieldErrors = {};
  if (!input.firstName.trim()) errors.firstName = "First name is required.";
  if (!input.lastName.trim()) errors.lastName = "Last name is required.";
  if (!input.email.trim()) errors.email = "Email is required.";
  else if (!isValidEmail(input.email))
    errors.email = "Enter a valid email address.";
  const cvError = validateCv(input.cv);
  if (cvError) errors.cv = cvError;
  return errors;
}

export function hasErrors(errors: CandidateFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
