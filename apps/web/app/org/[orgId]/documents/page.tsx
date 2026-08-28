'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import {
  ENVELOPE_MESSAGES,
  ENVELOPE_STATUSES,
  hasCapability,
} from '@devscribed/validation';
import { Badge, Button, Card, SearchField, Select, Spinner } from '@/ds';
import { PageHeader } from '@/layout/PageHeader';
import { useSession } from '@/layout/session-context';
import { apiRequest, templatesUrl, type TemplateListResponse } from '@/documents/api';
import {
  envelopeStatusLabel,
  envelopeStatusTone,
  envelopesUrl,
  formatDay,
  signerStatusLabel,
  signerStatusTone,
  type EnvelopeListItem,
  type EnvelopeListResponse,
} from '@/documents/envelopes';

/** Matches the templates list; a request per keystroke is not a search. */
const SEARCH_DEBOUNCE_MS = 300;

/** The documented default; the contract caps it at 100. */
const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  ...ENVELOPE_STATUSES.map((status) => ({
    value: status,
    label: envelopeStatusLabel(status),
  })),
];

export default function DocumentsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  return <DocumentsScreen orgId={orgId} />;
}

function DocumentsScreen({ orgId }: { orgId: string }) {
  const router = useRouter();
  const { role } = useSession();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [templateId, setTemplateId] = useState('all');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<EnvelopeListResponse | null>(null);
  const [templates, setTemplates] = useState<{ value: string; label: string }[]>([
    { value: 'all', label: 'All' },
  ]);
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async (): Promise<void> => {
    const search = new URLSearchParams();
    if (debouncedQuery.trim()) search.set('q', debouncedQuery.trim());
    if (status !== 'all') search.set('status', status);
    if (templateId !== 'all') search.set('templateId', templateId);
    search.set('page', String(page));
    search.set('pageSize', String(PAGE_SIZE));

    const result = await apiRequest<EnvelopeListResponse>(`${envelopesUrl(orgId)}?${search}`);
    if (!result.ok) {
      // 403 (no capability) and 404 (foreign org, per OrgScopeGuard) are the same answer
      // to the caller: this screen does not exist for them, and neither leaks data.
      if (result.failure.status === 403 || result.failure.status === 404) setGone(true);
      setLoading(false);
      return;
    }
    setData(result.data);
    setLoading(false);
  }, [orgId, debouncedQuery, status, templateId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  /** The template filter's options; a failure here leaves the filter at "All". */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await apiRequest<TemplateListResponse>(templatesUrl(orgId));
      if (cancelled || !result.ok) return;
      setTemplates([
        { value: 'all', label: 'All' },
        ...result.data.templates.map((template) => ({
          value: template.id,
          label: template.name,
        })),
      ]);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // The route itself is gated on ViewEnvelopes. Checking the session role as well as the
  // API answer means a `user` never sees the frame of a screen they are about to lose.
  if (gone || !hasCapability(role, 'ViewEnvelopes')) notFound();

  const canManage = data?.canManage ?? false;
  const envelopes = data?.envelopes ?? [];
  const total = data?.total ?? 0;
  const filtered = debouncedQuery.trim().length > 0 || status !== 'all' || templateId !== 'all';
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div data-testid="documents-page">
      <PageHeader
        title="Documents"
        action={
          canManage ? (
            <Button
              variant="primary"
              data-testid="envelope-new-btn"
              onClick={() => router.push(`/org/${orgId}/documents/new`)}
            >
              New document
            </Button>
          ) : undefined
        }
      />

      <Card padded={false}>
        <div
          style={{
            display: 'flex',
            gap: 'var(--sp-6)',
            alignItems: 'center',
            padding: 'var(--sp-8) var(--sp-10)',
          }}
        >
          <SearchField
            placeholder="Search documents"
            value={query}
            data-testid="envelope-search-input"
            onChange={(event) => setQuery(event.target.value)}
            style={{ flex: 1 }}
          />
          <Select
            value={status}
            options={STATUS_OPTIONS}
            onChange={(next: string) => {
              setStatus(next);
              setPage(1);
            }}
            data-testid="envelope-status-filter"
            wrapperStyle={{ width: 190 }}
          />
          <Select
            value={templateId}
            options={templates}
            onChange={(next: string) => {
              setTemplateId(next);
              setPage(1);
            }}
            data-testid="envelope-template-filter"
            wrapperStyle={{ width: 220 }}
          />
        </div>

        {loading && (
          <div
            data-testid="envelope-loading"
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: 'var(--sp-20)',
              color: 'var(--accent)',
            }}
          >
            <Spinner size={28} />
          </div>
        )}

        {!loading && envelopes.length === 0 && !filtered && (
          <div
            data-testid="envelope-empty"
            style={{
              padding: 'var(--sp-20)',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 'var(--fs-15)',
              borderTop: '1px solid var(--divider)',
            }}
          >
            {ENVELOPE_MESSAGES.empty.noDocuments}
          </div>
        )}

        {!loading && envelopes.length === 0 && filtered && (
          <div
            style={{
              padding: 'var(--sp-20)',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 'var(--fs-14)',
              borderTop: '1px solid var(--divider)',
            }}
          >
            No documents match this search.
          </div>
        )}

        {!loading && envelopes.length > 0 && (
          // Hand-rolled rather than the DS `Table`, for the same reason the templates list
          // is: the spec wants `envelope-row-{id}` on the row element and `Table` exposes
          // no per-row attributes. The tokens below are `Table`'s own.
          <div data-testid="envelopes-table">
            <div
              style={{
                display: 'flex',
                height: 52,
                padding: '0 var(--sp-10)',
                alignItems: 'center',
                background: 'var(--bg-header)',
                borderTop: '1px solid var(--divider)',
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: 'var(--fs-11)',
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              <span style={{ flex: 3 }}>Title</span>
              <span style={{ flex: 2 }}>Signers</span>
              <span style={{ flex: 1 }}>Status</span>
              <span style={{ flex: 1 }}>Sent</span>
            </div>

            {envelopes.map((item) => (
              <EnvelopeRow key={item.id} orgId={orgId} item={item} />
            ))}
          </div>
        )}

        {!loading && total > PAGE_SIZE && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--sp-6)',
              padding: 'var(--sp-8) var(--sp-10)',
              borderTop: '1px solid var(--divider)',
              fontSize: 'var(--fs-13)',
              color: 'var(--text-muted)',
            }}
          >
            <span>
              Page {page} of {lastPage} · {total} documents
            </span>
            <span style={{ display: 'flex', gap: 'var(--sp-4)' }}>
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= lastPage}
                onClick={() => setPage((current) => Math.min(lastPage, current + 1))}
              >
                Next
              </Button>
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}

function EnvelopeRow({ orgId, item }: { orgId: string; item: EnvelopeListItem }) {
  const router = useRouter();
  const href = `/org/${orgId}/documents/${item.id}`;
  const signers = [...item.signers].sort((a, b) => a.order - b.order);

  return (
    <div
      data-testid={`envelope-row-${item.id}`}
      style={{
        display: 'flex',
        minHeight: 68,
        alignItems: 'center',
        padding: '0 var(--sp-10)',
        borderTop: '1px solid var(--divider)',
        fontFamily: 'var(--font-text)',
        fontSize: 'var(--fs-15)',
        color: 'var(--text)',
      }}
    >
      <span style={{ flex: 3, minWidth: 0 }}>
        <a
          href={href}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey) return;
            event.preventDefault();
            router.push(href);
          }}
          style={{ color: 'var(--text)', textDecoration: 'none' }}
        >
          {item.title}
        </a>
        <span
          style={{ display: 'block', fontSize: 'var(--fs-13)', color: 'var(--text-muted)' }}
        >
          {item.templateName} v{item.templateVersionNumber}
        </span>
      </span>

      <span style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {signers.length === 0 && <span style={{ color: 'var(--text-muted)' }}>—</span>}
        {signers.map((signer) => (
          <span
            key={signer.id}
            data-testid={`envelope-signer-status-${item.id}-${signer.order}`}
            title={signerStatusLabel(signer.status)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-3)',
              fontSize: 'var(--fs-13)',
              color: 'var(--text-sub)',
            }}
          >
            <StatusDot status={signer.status} />
            {signer.name || '—'}
          </span>
        ))}
      </span>

      <span style={{ flex: 1 }}>
        <Badge tone={envelopeStatusTone(item.status)} data-testid={`envelope-status-${item.id}`}>
          {envelopeStatusLabel(item.status)}
        </Badge>
      </span>

      <span style={{ flex: 1, fontSize: 'var(--fs-14)', color: 'var(--text-muted)' }}>
        {formatDay(item.sentAt)}
      </span>
    </div>
  );
}

/**
 * The mockup's per-signer marker (`○ ● ✓`). A dot rather than a second `Badge`: two
 * pills per row would compete with the envelope status, and the signer's own status is
 * a progress hint, not the row's headline.
 */
function StatusDot({ status }: { status: EnvelopeListItem['signers'][number]['status'] }) {
  const tone = signerStatusTone(status);
  const color =
    tone === 'active'
      ? 'var(--status-active-ink)'
      : tone === 'inactive'
        ? 'var(--status-inactive-ink)'
        : tone === 'info'
          ? 'var(--accent)'
          : 'var(--text-faint)';
  return (
    <span
      aria-hidden
      style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  );
}
