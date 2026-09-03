'use client';

import { useEffect, useState } from 'react';
import type { AutofillValueType } from '@devscribed/validation';
import { apiRequest } from './api';

/**
 * `GET /api/organizations/{orgId}/autofill-sources` — requirement 3: the picker is
 * driven by the server, never by a hardcoded client list. The package's
 * `AUTOFILL_SOURCES` is the *resolver's* catalogue and is deliberately not used to
 * populate the dropdown; only the type-compatibility **rule** comes from the package.
 */
export interface AutofillSourceDto {
  key: string;
  /** Display group, verbatim from the server: "Member", "Organization", "System". */
  group: string;
  label: string;
  valueType: AutofillValueType;
  sensitive?: boolean;
}

interface AutofillSourcesResponse {
  sources: AutofillSourceDto[];
}

export const autofillSourcesUrl = (orgId: string) =>
  `/api/organizations/${orgId}/autofill-sources`;

/**
 * The catalogue is a closed, per-release table, so it is fetched once per organization
 * and kept — the field modal mounts and unmounts on every field the author opens, and
 * re-fetching a frozen lookup table on each of those would be noise.
 */
const cache = new Map<string, AutofillSourceDto[]>();

export type CatalogueState =
  | { status: 'loading' }
  | { status: 'ready'; sources: AutofillSourceDto[] }
  /** The picker still renders; it says why it is empty rather than looking broken. */
  | { status: 'failed' };

export function useAutofillSources(orgId: string): CatalogueState {
  const [state, setState] = useState<CatalogueState>(() => {
    const cached = cache.get(orgId);
    return cached ? { status: 'ready', sources: cached } : { status: 'loading' };
  });

  useEffect(() => {
    const cached = cache.get(orgId);
    if (cached) {
      setState({ status: 'ready', sources: cached });
      return;
    }

    let cancelled = false;
    void (async () => {
      const result = await apiRequest<AutofillSourcesResponse>(autofillSourcesUrl(orgId));
      if (cancelled) return;
      if (!result.ok || !Array.isArray(result.data?.sources)) {
        setState({ status: 'failed' });
        return;
      }
      cache.set(orgId, result.data.sources);
      setState({ status: 'ready', sources: result.data.sources });
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return state;
}

/** "Date", "Email" — how a hidden value type is named in the picker's hint line. */
export function valueTypeLabel(type: AutofillValueType): string {
  switch (type) {
    case 'multiline':
      return 'Multiline';
    case 'email':
      return 'Email';
    case 'date':
      return 'Date';
    default:
      return 'Text';
  }
}

/** "Date", "Date and email", "Date, email and text" — an English list, not a CSV. */
export function joinWords(words: string[]): string {
  if (words.length === 0) return '';
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}
