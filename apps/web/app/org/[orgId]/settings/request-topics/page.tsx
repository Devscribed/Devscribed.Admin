'use client';

import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { Button, InfoBanner } from '@/ds';
import { useSession } from '@/layout/session-context';
import {
  REQUEST_MESSAGES,
  can,
  clampSortOrder,
  compareRequestTopics,
  normalizeRole,
} from '@devscribed/validation';
import { RequestTopicModal, type RequestTopicModalMode } from './RequestTopicModal';
import type { RequestTopicRow, RequestTopicsResponse } from './types';

type Audience = 'staff' | 'client';

const AUDIENCES: readonly { value: Audience; label: string; testId: string }[] = [
  { value: 'staff', label: 'Staff', testId: 'request-topics-audience-staff' },
  { value: 'client', label: 'Client', testId: 'request-topics-audience-client' },
];

/**
 * Settings › Request topics (requests spec 02 §Screens). The catalogue an admin or a
 * manager curates: two audiences, an archived section under each, and no delete anywhere
 * — archiving is the only removal.
 *
 * Gated on `manage-request-topics`: a caller without it who types the address is sent to
 * the members list and nothing of this screen is drawn in the meantime, the pattern
 * Settings › Holidays already uses. The routes behind it refuse independently.
 *
 * **Ordering** is the up and down controls the spec's DS gaps table commits to, and no
 * drag handle: the `@ds` barrel exports no drag or sortable primitive, and a pointer-only
 * handle is unreachable from the keyboard. Each press issues exactly one `PATCH` of that
 * row's `sortOrder` and no other row's — up sends the row above's minus one, down sends
 * the row below's plus one — so the moved row lands past the neighbour it moved over. The
 * server clamps to 0–32767, and where the clamp meets a neighbour already on the bound the
 * two tie and the name tiebreak decides: that one press may leave the list as it was, and
 * every other press reorders it.
 *
 * **The audience switch** is two `Button`s carrying `aria-pressed`, the second DS gap the
 * spec's table commits to; `@ds` ships no segmented control.
 */
export default function RequestTopicsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const router = useRouter();
  const session = useSession();

  const role = normalizeRole(session.role);
  const authorized = can(role, 'manage-request-topics');

  useEffect(() => {
    if (!authorized) router.replace(`/org/${orgId}/members`);
  }, [authorized, router, orgId]);

  const [audience, setAudience] = useState<Audience>('staff');
  const [topics, setTopics] = useState<RequestTopicRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modalMode, setModalMode] = useState<RequestTopicModalMode | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setLoading(true);
      try {
        // `status=all` — the screen draws the active list and the archived one under it.
        const response = await fetch(
          `/api/organizations/${orgId}/request-topics?status=all`,
          { credentials: 'same-origin', signal },
        );
        if (signal?.aborted) return;
        if (response.ok) {
          const body = (await response.json()) as RequestTopicsResponse;
          if (signal?.aborted) return;
          setTopics(body.topics);
          setError(false);
        } else {
          // The last good list stays on screen behind the banner.
          setError(true);
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setError(true);
      }
      if (signal?.aborted) return;
      setLoading(false);
    },
    [orgId],
  );

  useEffect(() => {
    if (!authorized) return undefined;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [authorized, load]);

  const inAudience = useMemo(
    () => (topics ?? []).filter((topic) => topic.audience === audience),
    [topics, audience],
  );
  const active = useMemo(
    () => inAudience.filter((topic) => topic.status === 'active').sort(compareRequestTopics),
    [inAudience],
  );
  const archived = useMemo(
    () => inAudience.filter((topic) => topic.status === 'archived').sort(compareRequestTopics),
    [inAudience],
  );

  /** One `PATCH`, then a re-read of the catalogue. Nothing is written optimistically. */
  async function write(path: string, body?: object): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/organizations/${orgId}/request-topics${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      setError(true);
    }
    setBusy(false);
    await load();
  }

  /**
   * Move one row past the neighbour it steps over: one `PATCH` of that row's own
   * `sortOrder` and of no other row's. The value is clamped here as well as on the server
   * so the number sent is the number the rule allows.
   */
  function move(index: number, direction: -1 | 1): void {
    const row = active[index];
    const neighbour = active[index + direction];
    if (!row || !neighbour) return;
    const next = clampSortOrder(neighbour.sortOrder + direction);
    void write(`/${row.id}`, { sortOrder: next });
  }

  // Nothing is drawn while the redirect swaps the URL — no flash of the shell.
  if (!authorized) return null;

  return (
    <div data-testid="request-topics-page">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--sp-6)',
          flexWrap: 'wrap',
          marginBottom: 'var(--sp-8)',
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'var(--fs-27)',
              margin: '0 0 var(--sp-2)',
              color: 'var(--text)',
            }}
          >
            Request topics
          </h1>
          <div style={{ fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}>
            The words people pick from when they raise a request.
          </div>
        </div>
        <Button
          variant="primary"
          onClick={() => setModalMode({ kind: 'add', audience })}
          data-testid="request-topics-add-btn"
        >
          + Add topic
        </Button>
      </div>

      {/* DS gap: `@ds` ships no segmented control, so the audience switch is two
          `Button`s carrying an aria-pressed state and tokens only. */}
      <div
        role="group"
        aria-label="Audience"
        style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-8)' }}
      >
        {AUDIENCES.map((option) => (
          <Button
            key={option.value}
            variant={audience === option.value ? 'primary' : 'secondary'}
            size="sm"
            aria-pressed={audience === option.value}
            onClick={() => setAudience(option.value)}
            data-testid={option.testId}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {error && (
        <div data-testid="request-topics-error-banner" style={{ marginBottom: 'var(--sp-6)' }}>
          <InfoBanner tone="error" role="alert">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--sp-4)',
              }}
            >
              <span>{REQUEST_MESSAGES.genericError}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void load()}
                data-testid="request-topics-error-retry-btn"
              >
                Retry
              </Button>
            </div>
          </InfoBanner>
        </div>
      )}

      {loading && topics === null ? (
        <TopicsSkeleton />
      ) : (
        <>
          <div
            style={{
              background: 'var(--bg-panel)',
              border: 'var(--border-hair) solid var(--border)',
              borderRadius: 'var(--radius-2xl)',
              overflow: 'hidden',
            }}
          >
            {active.length === 0 ? (
              <div
                style={{
                  padding: 'var(--sp-10) var(--sp-8)',
                  textAlign: 'center',
                  fontFamily: 'var(--font-text)',
                  fontSize: 'var(--fs-14)',
                  color: 'var(--text-faint)',
                }}
              >
                No active topics in this audience. Add one to start.
              </div>
            ) : (
              active.map((topic, index) => (
                <TopicRow
                  key={topic.id}
                  topic={topic}
                  busy={busy}
                  // A control that cannot act is not drawn: the first row has no up
                  // control and the last has no down one.
                  canMoveUp={index > 0}
                  canMoveDown={index < active.length - 1}
                  onUp={() => move(index, -1)}
                  onDown={() => move(index, 1)}
                  onRename={() => setModalMode({ kind: 'rename', topic })}
                  onArchive={() => void write(`/${topic.id}/archive`)}
                  onRestore={() => void write(`/${topic.id}/restore`)}
                />
              ))
            )}
          </div>

          {archived.length > 0 && (
            <div style={{ marginTop: 'var(--sp-10)' }}>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--fs-11)',
                  letterSpacing: 'var(--ls-wider)',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  marginBottom: 'var(--sp-5)',
                }}
              >
                Archived
              </div>
              <div
                style={{
                  background: 'var(--bg-panel)',
                  border: 'var(--border-hair) solid var(--border)',
                  borderRadius: 'var(--radius-2xl)',
                  overflow: 'hidden',
                }}
              >
                {archived.map((topic) => (
                  // An archived row draws neither ordering control and no rename
                  // control: the route accepts both for a caller holding the id, and
                  // the screen offers restoring instead.
                  <TopicRow
                    key={topic.id}
                    topic={topic}
                    busy={busy}
                    canMoveUp={false}
                    canMoveDown={false}
                    onUp={() => undefined}
                    onDown={() => undefined}
                    onRename={() => undefined}
                    onArchive={() => undefined}
                    onRestore={() => void write(`/${topic.id}/restore`)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {modalMode && (
        <RequestTopicModal
          open
          mode={modalMode}
          orgId={orgId}
          onClose={() => setModalMode(null)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}

/** One catalogue row: the order controls, the name, the kind, and the row's actions. */
function TopicRow({
  topic,
  busy,
  canMoveUp,
  canMoveDown,
  onUp,
  onDown,
  onRename,
  onArchive,
  onRestore,
}: {
  topic: RequestTopicRow;
  busy: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onRename: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const isArchived = topic.status === 'archived';
  return (
    <div
      data-testid={`request-topic-row-${topic.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-5)',
        padding: 'var(--sp-4) var(--sp-6)',
        minHeight: 56,
        borderTop: 'var(--border-hair) solid var(--divider)',
      }}
    >
      <div style={{ display: 'flex', gap: 'var(--sp-2)', width: 84 }}>
        {canMoveUp && (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={onUp}
            aria-label={`Move ${topic.name} up`}
            data-testid={`request-topic-row-${topic.id}-up-btn`}
          >
            &uarr;
          </Button>
        )}
        {canMoveDown && (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={onDown}
            aria-label={`Move ${topic.name} down`}
            data-testid={`request-topic-row-${topic.id}-down-btn`}
          >
            &darr;
          </Button>
        )}
      </div>

      <div
        style={{
          flex: 1,
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          fontSize: 'var(--fs-15)',
          color: 'var(--text)',
          minWidth: 0,
        }}
      >
        {topic.name}
      </div>

      <div
        style={{
          width: 96,
          fontFamily: 'var(--font-text)',
          fontSize: 'var(--fs-13)',
          color: 'var(--text-muted)',
        }}
      >
        {topic.type}
      </div>

      <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
        {!isArchived && (
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={onRename}
              data-testid={`request-topic-row-${topic.id}-rename-btn`}
            >
              Rename
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={onArchive}
              data-testid={`request-topic-row-${topic.id}-archive-btn`}
            >
              Archive
            </Button>
          </>
        )}
        {isArchived && (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={onRestore}
            data-testid={`request-topic-row-${topic.id}-restore-btn`}
          >
            Restore
          </Button>
        )}
      </div>
    </div>
  );
}

/** Token-coloured blocks in the rows' place — no empty state, no flash of "no topics". */
function TopicsSkeleton() {
  return (
    <div
      data-testid="request-topics-loading-skeleton"
      style={{
        background: 'var(--bg-panel)',
        border: 'var(--border-hair) solid var(--border)',
        borderRadius: 'var(--radius-2xl)',
        overflow: 'hidden',
      }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-5)',
            padding: 'var(--sp-4) var(--sp-6)',
            minHeight: 56,
            borderTop: 'var(--border-hair) solid var(--divider)',
          }}
        >
          <div
            style={{
              width: 84,
              height: 16,
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-sunken)',
            }}
          />
          <div
            style={{
              flex: 1,
              height: 16,
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-sunken)',
            }}
          />
        </div>
      ))}
    </div>
  );
}
