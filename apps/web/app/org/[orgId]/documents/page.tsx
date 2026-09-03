'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import {
  ENVELOPE_MESSAGES,
  ENVELOPE_STATUSES,
  hasCapability,
} from '@devscribed/validation';
import { Badge, Button, Card, SearchInput, Select, Preloader, Table } from '@devscribed/ds';
import type { TableColumn } from '@devscribed/ds';
import { PageHeader } from '@/layout/PageHeader';
import { optionFor, valueOf } from '@/select';
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
            gap: 'var(--space-5)',
            alignItems: 'center',
            padding: 'var(--space-6) var(--space-7)',
          }}
        >
          <SearchInput
            placeholder="Search documents"
            value={query}
            data-testid="envelope-search-input"
            onChange={(event) => setQuery(event.target.value)}
            style={{ flex: 1 }}
          />
          <Select
            value={optionFor(STATUS_OPTIONS, status)}
            options={STATUS_OPTIONS}
            onChange={(option) => {
              setStatus(valueOf(option));
              setPage(1);
            }}
            data-testid="envelope-status-filter"
            wrapperStyle={{ width: 190 }}
          />
          <Select
            value={optionFor(templates, templateId)}
            options={templates}
            onChange={(option) => {
              setTemplateId(valueOf(option));
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
              padding: 'var(--space-12)',
              color: 'var(--action-primary)',
            }}
          >
            <Preloader size={28} />
          </div>
        )}

        {!loading && envelopes.length === 0 && !filtered && (
          <div
            data-testid="envelope-empty"
            style={{
              padding: 'var(--space-12)',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: 'var(--font-size-base)',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            {ENVELOPE_MESSAGES.empty.noDocuments}
          </div>
        )}

        {!loading && envelopes.length === 0 && filtered && (
          <div
            style={{
              padding: 'var(--space-12)',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: 'var(--font-size-s)',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            No documents match this search.
          </div>
        )}

        {!loading && envelopes.length > 0 && (
          <Table<EnvelopeListItem>
            data-testid="envelopes-table"
            columns={envelopeColumns}
            rows={envelopes}
            rowKey="id"
            rowTestId={(item) => `envelope-row-${item.id}`}
            rowHref={(item) => `/org/${orgId}/documents/${item.id}`}
            onRowClick={(item, event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              router.push(`/org/${orgId}/documents/${item.id}`);
            }}
          />
        )}

        {!loading && total > PAGE_SIZE && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-5)',
              padding: 'var(--space-6) var(--space-7)',
              borderTop: '1px solid var(--border-subtle)',
              fontSize: 'var(--font-size-s)',
              color: 'var(--text-secondary)',
            }}
          >
            <span>
              Page {page} of {lastPage} · {total} documents
            </span>
            <span style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <Button
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
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

/**
 * The list's columns. `Table` (§18) draws the header, the row and its anchor, so what is
 * left here is only what each cell holds — which is what a column is.
 */
const envelopeColumns: TableColumn<EnvelopeListItem>[] = [
  {
    label: 'Title',
    flex: 3,
    align: 'flex-start',
    render: (item) => (
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', color: 'var(--text-primary)' }}>{item.title}</span>
        <span
          style={{ display: 'block', fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}
        >
          {item.templateName} v{item.templateVersionNumber}
        </span>
      </span>
    ),
  },
  {
    label: 'Signers',
    flex: 2,
    align: 'flex-start',
    render: (item) => {
      const signers = [...item.signers].sort((a, b) => a.order - b.order);
      return (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {signers.length === 0 && <span style={{ color: 'var(--text-secondary)' }}>—</span>}
          {signers.map((signer) => (
            <span
              key={signer.id}
              data-testid={`envelope-signer-status-${item.id}-${signer.order}`}
              title={signerStatusLabel(signer.status)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                fontSize: 'var(--font-size-s)',
                color: 'var(--text-tertiary)',
              }}
            >
              <StatusDot status={signer.status} />
              {signer.name || '—'}
            </span>
          ))}
        </span>
      );
    },
  },
  {
    label: 'Status',
    flex: 1,
    align: 'flex-start',
    render: (item) => (
      <Badge status={envelopeStatusTone(item.status)} data-testid={`envelope-status-${item.id}`}>
        {envelopeStatusLabel(item.status)}
      </Badge>
    ),
  },
  {
    label: 'Sent',
    flex: 1,
    align: 'flex-start',
    // §60's 96px cap belongs to an actions column; this one holds a date.
    maxWidth: 'none',
    render: (item) => (
      <span style={{ fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}>
        {formatDay(item.sentAt)}
      </span>
    ),
  },
];

/**
 * The mockup's per-signer marker (`○ ● ✓`). A dot rather than a second `Badge`: two
 * pills per row would compete with the envelope status, and the signer's own status is
 * a progress hint, not the row's headline.
 */
function StatusDot({ status }: { status: EnvelopeListItem['signers'][number]['status'] }) {
  const tone = signerStatusTone(status);
  const color =
    tone === 'active'
      ? 'var(--status-success)'
      : tone === 'inactive'
        ? 'var(--status-error)'
        : tone === 'info'
          ? 'var(--action-primary)'
          : 'var(--text-secondary)';
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
