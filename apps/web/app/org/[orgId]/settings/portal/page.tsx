'use client';

import { notFound } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { hasCapability } from '@devscribed/validation';
import { Button, Card, InfoBanner, Preloader, Switch } from '@devscribed/ds';
import { PageHeader } from '@/layout/PageHeader';
import { useSession } from '@/layout/session-context';

/**
 * `GET` / `PUT /api/organizations/{orgId}/portal/settings` (`01-home.contracts.md` §Routes).
 * Declared here rather than imported from `portal-types.ts`, which belongs to the home
 * screen's own task.
 */
interface PortalSettingsGroups {
  people: boolean;
  hiring: boolean;
  work: boolean;
}

interface PortalSettingsResponse {
  groups: PortalSettingsGroups;
}

interface GroupRowMeta {
  key: keyof PortalSettingsGroups;
  testId: string;
  label: string;
  description: string;
}

/** The three switches, in the order the mock draws them. */
const GROUP_ROWS: GroupRowMeta[] = [
  {
    key: 'people',
    testId: 'portal-settings-group-people',
    label: 'People',
    description: 'Somebody joins the team, and the years they have been here.',
  },
  {
    key: 'hiring',
    testId: 'portal-settings-group-hiring',
    label: 'Hiring',
    description: 'A vacancy opens. Candidates, interviews and assessments never appear here.',
  },
  {
    key: 'work',
    testId: 'portal-settings-group-work',
    label: 'Work',
    description: "A project starts, a client is added. A client's name is shown only to those who may already see it.",
  },
];

const settingsUrl = (orgId: string) => `/api/organizations/${orgId}/portal/settings`;

/**
 * `/org/{orgId}/settings/portal` — REQ-01-048, REQ-01-050, REQ-01-051, REQ-01-052. Gated
 * exactly as `apps/web/app/org/[orgId]/settings/signing/page.tsx` gates on
 * `ViewSigningSettings`: a caller without `ManagePortalSettings` gets `notFound()` here and
 * has no way to reach this route, so the screen never draws
 * `PORTAL_MESSAGES.settingsForbidden` — that refusal is the API's answer to a direct call
 * (asserted at integration, not on a screen).
 *
 * The save button is never disabled for validation: all three values are booleans the screen
 * itself owns, so there is nothing about them that can be invalid. It is disabled only while
 * a save is in flight, and the flag is cleared in a `finally`.
 */
export default function PortalSettingsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);
  const { role } = useSession();

  if (!hasCapability(role, 'ManagePortalSettings')) notFound();

  const [groups, setGroups] = useState<PortalSettingsGroups | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(settingsUrl(orgId), { credentials: 'same-origin' });
      if (!response.ok) {
        setError('Something went wrong loading the portal settings. Try reloading the page.');
        setLoading(false);
        return;
      }
      const data = (await response.json()) as PortalSettingsResponse;
      setGroups(data.groups);
      setError(null);
      setLoading(false);
    } catch {
      setError('Something went wrong loading the portal settings. Try reloading the page.');
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(): Promise<void> {
    if (!groups || saving) return;
    setSaving(true);
    try {
      const response = await fetch(settingsUrl(orgId), {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups }),
      });
      if (!response.ok) {
        setError('Something went wrong saving the portal settings. Try again.');
        return;
      }
      const data = (await response.json()) as PortalSettingsResponse;
      setGroups(data.groups);
      setError(null);
    } catch {
      setError('Something went wrong saving the portal settings. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Portal" subtitle="What the organization sees on the home screen." />

      {error && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <InfoBanner variant="error">{error}</InfoBanner>
        </div>
      )}

      <div style={{ maxWidth: 720 }}>
        <Card title="What's new" padded={false}>
          {loading || !groups ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-9) 0' }}>
              <Preloader />
            </div>
          ) : (
            GROUP_ROWS.map((row) => (
              <div
                key={row.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-7)',
                  padding: 'var(--space-6)',
                  borderTop: 'var(--border-width-hairline) solid var(--border-subtle)',
                }}
              >
                <span>
                  <span style={{ display: 'block', fontWeight: 'var(--font-weight-medium)', color: 'var(--text-primary)' }}>
                    {row.label}
                  </span>
                  <span style={{ display: 'block', marginTop: 'var(--space-1)', fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}>
                    {row.description}
                  </span>
                </span>
                <Switch
                  data-testid={row.testId}
                  checked={groups[row.key]}
                  onChange={(next) => setGroups({ ...groups, [row.key]: next })}
                  aria-label={row.label}
                />
              </div>
            ))
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: 'var(--space-6)',
              borderTop: 'var(--border-width-hairline) solid var(--border-subtle)',
            }}
          >
            <Button
              variant="primary"
              // The only permitted reason: an in-flight guard. Never for validation.
              preloader={saving}
              disabled={!groups}
              data-testid="portal-settings-save"
              onClick={() => void save()}
            >
              Save
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
