import type { SignerRole, TemplateFieldType } from '@devscribed/validation';

/**
 * Raw request bodies. Deliberately untyped-but-shaped, exactly as `signup.dto.ts` is:
 * every rule and every message lives in `@devscribed/validation`, so the DTO describes
 * what the wire may carry, never what is legal.
 */

export interface CreateTemplateDto {
  name?: string;
  description?: string | null;
}

export interface TemplateFieldDto {
  key?: string;
  label?: string;
  type?: TemplateFieldType;
  required?: boolean;
  options?: unknown;
  maxLength?: number | null;
  filledBy?: string;
  autofillSource?: string | null;
  order?: number;
}

export interface SaveDraftDto {
  rowVersion?: number;
  bodyHtml?: string;
  signerRoles?: unknown;
  fields?: TemplateFieldDto[];
}

export interface PreviewDto {
  versionId?: string;
}

/** The shape stored in `DocumentTemplateVersion.signerRoles`, re-exported for clarity. */
export type StoredSignerRole = SignerRole;
