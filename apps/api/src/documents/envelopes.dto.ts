import type { TemplateFieldType } from '@devscribed/validation';

/**
 * Raw request bodies, in the same style as `document-templates.dto.ts`: the DTO says
 * what the wire may carry, never what is legal. Every rule and every message lives in
 * `@devscribed/validation`.
 */

export interface CreateEnvelopeDto {
  templateId?: string;
  subjectMembershipId?: string | null;
  title?: string | null;
  expiresInDays?: unknown;
}

export interface UpdateSignerDto {
  id?: string;
  name?: string;
  email?: string;
  order?: number;
}

export interface UpdateEnvelopeDto {
  title?: string;
  expiresInDays?: unknown;
  fieldValues?: Record<string, unknown>;
  signers?: UpdateSignerDto[];
}

export interface VoidEnvelopeDto {
  reason?: string;
}

export interface SignDto {
  fieldValues?: Record<string, unknown>;
  signature?: unknown;
  consentAccepted?: boolean;
}

export interface DeclineDto {
  reason?: string | null;
}

/**
 * A field of the pinned version, as the service works with it. Read from
 * `DocumentTemplateVersion.fieldsSnapshot` — the copy frozen at publish — so a later
 * edit to the live `TemplateField` rows cannot change the shape of a document in flight.
 */
export interface EnvelopeField {
  key: string;
  label: string;
  type: TemplateFieldType;
  required: boolean;
  options: string[] | null;
  maxLength: number | null;
  filledBy: string;
  autofillSource: string | null;
  order: number;
}
