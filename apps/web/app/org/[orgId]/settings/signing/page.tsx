'use client';

import { notFound } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import {
  SIGNING_PROVIDER_MESSAGES,
  hasCapability,
  signingProviderName,
} from '@devscribed/validation';
import { Button, Card, InfoBanner, Preloader } from '@devscribed/ds';
import { PageHeader } from '@/layout/PageHeader';
import { useSession } from '@/layout/session-context';
import { useToast } from '@/toast';
import { apiRequest, failureMessage } from '@/documents/api';
import { formatLongDate, signingSettingsUrl, type SigningSettings } from '@/documents/envelopes';
import { ChangeProviderModal } from './ChangeProviderModal';
import { ProviderOption } from './ProviderOption';

/**
 * `/org/{orgId}/settings/signing` — the product's **first organization-settings surface**.
 *
 * Who may see what is the whole shape of the screen. An admin chooses; a manager sees the
 * current provider read-only and the save button is **not rendered at all** rather than
 * merely disabled, because a control the caller cannot use is not drawn; `user` and
 * `viewer` get `notFound()` here and have no Settings entry in the sidebar, so there is no
 * dead link to a route that would answer 404 anyway.
 *
 * The save button is **never disabled for validation** — the modal's confirm button is,
 * and that is the deliberate confirmation `CLAUDE.md` allows.
 */
export default function SigningSettingsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);
  const { role } = useSession();
  const { showToast } = useToast();

  if (!hasCapability(role, 'ViewSigningSettings')) notFound();
  const canManage = hasCapability(role, 'ManageSigningSettings');

  const [settings, setSettings] = useState<SigningSettings | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * `null` until the response lands, deliberately: no provider is pre-selected, so a slow
   * network can never show "Built-in" for an organization that is on SignWell.
   */
  const [selected, setSelected] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const result = await apiRequest<SigningSettings>(signingSettingsUrl(orgId));
    setLoading(false);
    if (!result.ok) {
      setError(failureMessage(result.failure));
      return;
    }
    setSettings(result.data);
    setSelected(result.data.current);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(): Promise<void> {
    if (!settings || !selected || saving) return;

    const result = await (async () => {
      setSaving(true);
      const response = await apiRequest<{ current: string }>(signingSettingsUrl(orgId), {
        method: 'PUT',
        body: JSON.stringify({ provider: selected, confirmed: true }),
      });
      setSaving(false);
      return response;
    })();

    if (!result.ok) {
      setModalOpen(false);
      setConfirmed(false);
      // The admin's selection is kept and the stored provider is untouched; the message
      // is the shared one rather than one invented here.
      setError(
        result.failure.errors?.provider ??
          result.failure.message ??
          SIGNING_PROVIDER_MESSAGES.settings.saveFailed,
      );
      return;
    }

    setModalOpen(false);
    setConfirmed(false);
    setError(null);
    showToast(
      'toast-signing-provider-saved',
      SIGNING_PROVIDER_MESSAGES.settings.saved(signingProviderName(selected)),
    );
    await load();
  }

  const current = settings?.current ?? null;
  const testModeOn = (settings?.providers ?? []).some(
    (option) => option.key === current && option.testMode,
  );

  return (
    <div data-testid="signing-settings">
      <PageHeader
        title="Signing"
        subtitle={SIGNING_PROVIDER_MESSAGES.settings.subheading}
      />

      {error && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <InfoBanner variant="error">{error}</InfoBanner>
        </div>
      )}

      <Card title={SIGNING_PROVIDER_MESSAGES.settings.heading} padded={false}>
        {loading ? (
          <LoadingRows />
        ) : (
          (settings?.providers ?? []).map((option) => (
            <ProviderOption
              key={option.key}
              option={option}
              selected={selected === option.key}
              active={current === option.key}
              readOnly={!canManage}
              onSelect={(key) => {
                setSelected(key);
                setError(null);
              }}
            />
          ))
        )}

        {testModeOn && (
          <div style={{ padding: 'var(--space-6)', borderTop: 'var(--border-width-hairline) solid var(--border-subtle)' }}>
            <InfoBanner variant="warning" data-testid="signing-test-mode-banner">
              {SIGNING_PROVIDER_MESSAGES.settings.testModeNotice}
            </InfoBanner>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-7)',
            flexWrap: 'wrap',
            padding: 'var(--space-6)',
            borderTop: 'var(--border-width-hairline) solid var(--border-subtle)',
          }}
        >
          <span style={{ fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}>
            {settings?.setAt
              ? `Last changed ${formatLongDate(settings.setAt)}${
                  settings.setBy ? ` by ${settings.setBy.name}` : ''
                }`
              : 'Never changed'}
          </span>
          {/* Not rendered at all for a manager — see the note at the top of the file. */}
          {canManage && (
            <Button
              variant="primary"
              // The only permitted reason: an in-flight guard. Never for validation —
              // clicking an unchanged or invalid selection is how the admin learns why.
              preloader={saving}
              data-testid="signing-provider-save"
              onClick={() => {
                if (!selected || !settings) return;
                if (selected === settings.current) {
                  setError(null);
                  showToast(
                    'toast-signing-provider-saved',
                    SIGNING_PROVIDER_MESSAGES.settings.saved(signingProviderName(selected)),
                  );
                  return;
                }
                setConfirmed(false);
                setModalOpen(true);
              }}
            >
              Save provider
            </Button>
          )}
        </div>
      </Card>

      <ChangeProviderModal
        open={modalOpen}
        providerName={signingProviderName(selected ?? '')}
        inFlightCount={settings?.inFlightCount ?? 0}
        confirmed={confirmed}
        saving={saving}
        onConfirmedChange={setConfirmed}
        onCancel={() => {
          setModalOpen(false);
          setConfirmed(false);
        }}
        onConfirm={() => void save()}
      />
    </div>
  );
}


/**
 * The `GET .../settings/signing` wait.
 *
 * It was two grey blocks standing in for the provider rows, on the carried "no `Skeleton`
 * primitive" gap. The system's answer for waiting is `Preloader` (§23, §69), and an outline
 * of two rows says nothing the dots do not — the one case the design system's record leaves
 * an outline standing is a *list* long enough that its shape is the information, which two
 * rows are not. No spec names this state's test id; it is kept because the run that wrote it
 * recorded it, and it is the handle for "the page has not answered yet".
 */
function LoadingRows() {
  return (
    <div
      role="status"
      data-testid="signing-settings-loading"
      aria-label="Loading signing settings"
      style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-9) 0' }}
    >
      <Preloader />
    </div>
  );
}
