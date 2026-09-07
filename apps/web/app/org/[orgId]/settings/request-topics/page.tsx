'use client';

import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { Button, InfoBanner, ToggleButton } from '@devscribed/ds';
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
 * drag handle: the design system exports no drag or sortable primitive, and a pointer-only
 * handle is unreachable from the keyboard. Each press issues exactly one `PATCH` of that
 * row's `sortOrder` and no other row's — up sends the row above's minus one, down sends
 * the row below's plus one — so the moved row lands past the neighbour it moved over. The
 * server clamps to 0–32767, and where the clamp meets a neighbour already on the bound the
 * two tie and the name tiebreak decides: that one press may leave the list as it was, and
 * every other press reorders it.
 *
 * **The audience switch** is `ToggleButton`, the system's segmented control. The spec's DS
 * gaps table recorded it as missing and it has since shipped, so the two `aria-pressed`
 * buttons that stood in for it are gone.
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
  /** The message the banner shows, or `null` for no banner. */
  const [error, setError] = useState<string | null>(null);
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
          setError(null);
        } else {
          // The last good list stays on screen behind the banner.
          setError(REQUEST_MESSAGES.genericError);
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setError(REQUEST_MESSAGES.genericError);
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

  /**
   * One `PATCH`, then a re-read of the catalogue. Nothing is written optimistically.
   *
   * **A refusal is shown, never swallowed.** These routes publish two user-facing strings
   * the curator can genuinely reach: `statusUnchanged` when somebody else archived the row
   * first (REQ-02-013, edge case 12) and `manageForbidden` for a curator demoted
   * mid-session (REQ-02-007). Reading only the thrown case would leave both — and every
   * 5xx — as a press that appears to do nothing, or worse, as a row that moves because
   * *another* curator's write landed while this one was refused.
   *
   * The re-read happens either way, so the screen still shows the truth; the message is
   * applied after it, because a successful `load()` clears the banner and would otherwise
   * erase the refusal it is there to report.
   */
  async function write(path: string, body?: object): Promise<void> {
    if (busy) return;
    setBusy(true);

    let failure: string | null = null;
    try {
      const response = await fetch(`/api/organizations/${orgId}/request-topics${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) {
        const answer = await response.json().catch(() => null);
        failure = answer?.message ?? REQUEST_MESSAGES.genericError;
      }
    } catch {
      failure = REQUEST_MESSAGES.genericError;
    }

    setBusy(false);
    await load();
    if (failure) setError(failure);
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
          gap: 'var(--space-5)',
          flexWrap: 'wrap',
          marginBottom: 'var(--space-6)',
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-family-base)',
              fontWeight: 600,
              fontSize: 'var(--headline-4-size)',
              margin: '0 0 var(--space-1)',
              color: 'var(--text-primary)',
            }}
          >
            Request topics
          </h1>
          <div style={{ fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}>
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

      {/* The DS gap this screen recorded is closed: the system ships the segmented control
          now, so the switch is one `role="radiogroup"` with one tab stop rather than two
          buttons a reader is told are two separate actions. */}
      <ToggleButton
        label="Audience"
        options={AUDIENCES.map((option) => ({
          value: option.value,
          label: option.label,
          testId: option.testId,
        }))}
        selectedValue={audience}
        onChange={(value) => setAudience(value as Audience)}
        style={{ marginBottom: 'var(--space-6)' }}
      />

      {/* Carries whatever the server said — `statusUnchanged`, `manageForbidden` or the
          generic copy — so a refused press says why it was refused rather than looking
          like a press that did nothing.

          No `data-testid` on the banner or its retry control: the spec's testid table
          names none for either, and an id the spec does not name is not mine to add. */}
      {error !== null && (
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <InfoBanner variant="error" role="alert">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-3)',
              }}
            >
              <span>{error}</span>
              <Button
                onClick={() => void load()}
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
              background: 'var(--surface-card)',
              border: 'var(--border-width-hairline) solid var(--border-default)',
              borderRadius: 'var(--radius-xl)',
              overflow: 'hidden',
            }}
          >
            {active.length === 0 ? (
              <div
                style={{
                  padding: 'var(--space-7) var(--space-6)',
                  textAlign: 'center',
                  fontFamily: 'var(--font-family-base)',
                  fontSize: 'var(--font-size-s)',
                  color: 'var(--text-tertiary)',
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
            <div style={{ marginTop: 'var(--space-7)' }}>
              <div
                style={{
                  fontFamily: 'var(--font-family-base)',
                  fontSize: 'var(--font-size-xs)',
                  textTransform: 'uppercase',
                  color: 'var(--text-secondary)',
                  marginBottom: 'var(--space-4)',
                }}
              >
                Archived
              </div>
              <div
                style={{
                  background: 'var(--surface-card)',
                  border: 'var(--border-width-hairline) solid var(--border-default)',
                  borderRadius: 'var(--radius-xl)',
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
        gap: 'var(--space-4)',
        padding: 'var(--space-3) var(--space-5)',
        minHeight: 56,
        borderTop: 'var(--border-width-hairline) solid var(--border-subtle)',
      }}
    >
      <div style={{ display: 'flex', gap: 'var(--space-1)', width: 84 }}>
        {canMoveUp && (
          <Button
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
          fontFamily: 'var(--font-family-base)',
          fontWeight: 500,
          fontSize: 'var(--font-size-base)',
          color: 'var(--text-primary)',
          minWidth: 0,
        }}
      >
        {topic.name}
      </div>

      <div
        style={{
          width: 96,
          fontFamily: 'var(--font-family-base)',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-secondary)',
        }}
      >
        {topic.type}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {!isArchived && (
          <>
            <Button
              disabled={busy}
              onClick={onRename}
              data-testid={`request-topic-row-${topic.id}-rename-btn`}
            >
              Rename
            </Button>
            <Button
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
    // No `data-testid` here either, for the same reason: the spec names none for the
    // skeleton. The UI Description's "Loading (catalogue)" row requires it to be drawn in
    // the rows' place, which it is.
    <div
      style={{
        background: 'var(--surface-card)',
        border: 'var(--border-width-hairline) solid var(--border-default)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
      }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-5)',
            minHeight: 56,
            borderTop: 'var(--border-width-hairline) solid var(--border-subtle)',
          }}
        >
          <div
            style={{
              width: 84,
              height: 16,
              borderRadius: 'var(--radius-m)',
              background: 'var(--surface-sunken)',
            }}
          />
          <div
            style={{
              flex: 1,
              height: 16,
              borderRadius: 'var(--radius-m)',
              background: 'var(--surface-sunken)',
            }}
          />
        </div>
      ))}
    </div>
  );
}
