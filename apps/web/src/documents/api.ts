'use client';

import { TEMPLATE_MESSAGES, type TemplateFieldType, type TemplateStatus } from '@devscribed/validation';

/* ------------------------------------------------------------------ *
 * Wire shapes — spec 01, "API Contracts"
 * ------------------------------------------------------------------ */

export interface TemplateListItem {
  id: string;
  name: string;
  description: string | null;
  status: TemplateStatus;
  currentVersionNumber: number | null;
  hasOpenDraft: boolean;
  updatedAt: string;
  envelopeCount: number;
}

export interface TemplateListResponse {
  templates: TemplateListItem[];
  canManage: boolean;
}

export interface TemplateFieldDto {
  id?: string;
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

export interface SignerRoleDto {
  key: string;
  label: string;
  order: number;
}

export interface TemplateVersionRef {
  id: string;
  versionNumber: number;
  publishedAt: string | null;
  /**
   * The documented `currentVersion` shape carries only the three fields above, which
   * leaves the editor with nothing to render for a published template that has no open
   * draft. These are read when the API supplies them and treated as absent otherwise —
   * the read-only body is then simply empty rather than the page failing.
   */
  bodyHtml?: string;
  signerRoles?: SignerRoleDto[];
  fields?: TemplateFieldDto[];
}

export interface TemplateDraftVersion {
  id: string;
  versionNumber: number;
  rowVersion: number;
  bodyHtml: string;
  signerRoles: SignerRoleDto[];
  fields: TemplateFieldDto[];
}

export interface TemplateValidation {
  unknownPlaceholders: string[];
  unusedFields: string[];
}

export interface TemplateDetail {
  id: string;
  name: string;
  description: string | null;
  status: TemplateStatus;
  currentVersion: TemplateVersionRef | null;
  draftVersion: TemplateDraftVersion | null;
  validation: TemplateValidation;
  canManage: boolean;
  canDelete: boolean;
}

export interface DraftSaveResponse {
  versionId: string;
  versionNumber: number;
  rowVersion: number;
  bodyHtml: string;
  sanitized: boolean;
  removedElements: string[];
  validation: TemplateValidation;
}

export interface CreateTemplateResponse {
  id: string;
  versionId: string;
  versionNumber: number;
}

export interface PublishResponse {
  versionId: string;
  versionNumber: number;
  publishedAt: string;
}

/* ------------------------------------------------------------------ *
 * Request helper
 * ------------------------------------------------------------------ */

/**
 * Every documented failure in spec 01 is a status plus a machine-readable discriminator,
 * so callers branch on `error` rather than on prose. A thrown fetch is folded into the
 * same shape with status 0 — a caller that has to distinguish "offline" from "500" would
 * show the same message either way.
 */
export interface ApiFailure {
  status: number;
  error?: string;
  message?: string;
  errors?: Record<string, string>;
  keys?: string[];
  envelopeCount?: number;
  offset?: number;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

export async function apiRequest<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'same-origin',
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
    });
  } catch {
    return { ok: false, failure: { status: 0 } };
  }

  if (response.status === 204) return { ok: true, data: undefined as T };

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, failure: { status: response.status, ...(body ?? {}) } };
  }
  return { ok: true, data: body as T };
}

/** The one message every unrecognized failure collapses to (spec's Error Messages table). */
export function failureMessage(failure: ApiFailure): string {
  return failure.message ?? TEMPLATE_MESSAGES.generic.networkError;
}

export const templatesUrl = (orgId: string) =>
  `/api/organizations/${orgId}/document-templates`;

export const templateUrl = (orgId: string, templateId: string) =>
  `${templatesUrl(orgId)}/${templateId}`;
