'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  TEMPLATE_MESSAGES,
  validateTemplateDescription,
  validateTemplateName,
} from '@devscribed/validation';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  FormActions,
  TextInput,
  Modal,
  Popover,
  SearchInput,
  Select,
  Preloader,
  Table,
} from '@devscribed/ds';
import { focusByTestId } from '@/field-error';
import { PageHeader } from '@/layout/PageHeader';
import { optionFor, valueOf } from '@/select';
import {
  apiRequest,
  failureMessage,
  templateUrl,
  templatesUrl,
  type CreateTemplateResponse,
  type TemplateListItem,
  type TemplateListResponse,
} from '@/documents/api';
import { formatUpdatedAt, statusLabel, statusTone } from '@/documents/format';
import { PreviewModal } from '@/documents/PreviewModal';
import { useToast } from '@/toast';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

/** Long enough that typing a name does not fire a request per keystroke. */
const SEARCH_DEBOUNCE_MS = 300;

export default function TemplatesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  return <TemplatesScreen orgId={orgId} />;
}

function TemplatesScreen({ orgId }: { orgId: string }) {
  const router = useRouter();
  const { showToast } = useToast();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [status, setStatus] = useState('all');

  const [data, setData] = useState<TemplateListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<TemplateListItem | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState<{ item: TemplateListItem; count: number } | null>(
    null,
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async (): Promise<void> => {
    const search = new URLSearchParams();
    if (debouncedQuery.trim()) search.set('q', debouncedQuery.trim());
    if (status !== 'all') search.set('status', status);
    const suffix = search.toString() ? `?${search}` : '';

    const result = await apiRequest<TemplateListResponse>(`${templatesUrl(orgId)}${suffix}`);
    if (!result.ok) {
      // 403 (no capability) and 404 (foreign org, per OrgScopeGuard) are the same thing
      // to the caller: this screen does not exist for them, and no data leaks either way.
      if (result.failure.status === 403 || result.failure.status === 404) setGone(true);
      setLoading(false);
      return;
    }
    setData(result.data);
    setLoading(false);
  }, [orgId, debouncedQuery, status]);

  useEffect(() => {
    void load();
  }, [load]);

  if (gone) notFound();

  const canManage = data?.canManage ?? false;
  const templates = data?.templates ?? [];
  const filtered = debouncedQuery.trim().length > 0 || status !== 'all';

  async function archive(item: TemplateListItem): Promise<void> {
    setArchiveTarget(null);
    setDeleteBlocked(null);
    const result = await apiRequest(`${templateUrl(orgId, item.id)}/archive`, { method: 'POST' });
    if (!result.ok) {
      showToast('toast-template-error', failureMessage(result.failure), 'error');
      return;
    }
    showToast('toast-template-archived', TEMPLATE_MESSAGES.toast.archived);
    await load();
  }

  async function remove(item: TemplateListItem): Promise<void> {
    const result = await apiRequest(templateUrl(orgId, item.id), { method: 'DELETE' });
    if (!result.ok) {
      if (result.failure.error === 'template_in_use') {
        setDeleteBlocked({ item, count: result.failure.envelopeCount ?? item.envelopeCount });
        return;
      }
      showToast('toast-template-error', failureMessage(result.failure), 'error');
      return;
    }
    showToast('toast-template-deleted', TEMPLATE_MESSAGES.toast.deleted);
    await load();
  }

  async function preview(item: TemplateListItem): Promise<void> {
    const result = await apiRequest<{ html: string }>(`${templateUrl(orgId, item.id)}/preview`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (!result.ok) {
      showToast('toast-template-error', failureMessage(result.failure), 'error');
      return;
    }
    setPreviewHtml(result.data.html);
  }

  return (
    <div data-testid="templates-page">
      <PageHeader
        title="Templates"
        action={
          canManage ? (
            <Button variant="primary" data-testid="template-new-btn" onClick={() => setNewOpen(true)}>
              New template
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
            placeholder="Search templates"
            value={query}
            data-testid="template-search-input"
            onChange={(event) => setQuery(event.target.value)}
            style={{ flex: 1 }}
          />
          <Select
            value={optionFor(STATUS_OPTIONS, status)}
            options={STATUS_OPTIONS}
            onChange={(option) => setStatus(valueOf(option))}
            data-testid="template-status-filter"
            wrapperStyle={{ width: 180 }}
          />
        </div>

        {loading && (
          <div
            data-testid="template-loading"
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

        {!loading && templates.length === 0 && !filtered && (
          <div
            data-testid="template-empty"
            style={{
              padding: 'var(--space-12)',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: 'var(--font-size-base)',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            {TEMPLATE_MESSAGES.generic.emptyState}
          </div>
        )}

        {!loading && templates.length === 0 && filtered && (
          <div
            style={{
              padding: 'var(--space-12)',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: 'var(--font-size-s)',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            No templates match this search.
          </div>
        )}

        {!loading && templates.length > 0 && (
          <Table<TemplateListItem>
            data-testid="templates-table"
            columns={[
              {
                label: 'Name',
                flex: 3,
                align: 'flex-start',
                render: (item) => <span style={{ minWidth: 0 }}>{item.name}</span>,
              },
              {
                label: 'Version',
                flex: 1,
                align: 'flex-start',
                render: (item) => (
                  <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>
                    {item.currentVersionNumber ? `v${item.currentVersionNumber}` : '—'}
                    {item.hasOpenDraft && (
                      <span
                        style={{
                          color: 'var(--text-secondary)',
                          fontWeight: 'var(--font-weight-regular)',
                        }}
                      >
                        {' '}
                        + draft
                      </span>
                    )}
                  </span>
                ),
              },
              {
                label: 'Status',
                flex: 1,
                align: 'flex-start',
                render: (item) => (
                  <Badge status={statusTone(item.status)} data-testid={`template-status-${item.id}`}>
                    {statusLabel(item.status)}
                  </Badge>
                ),
              },
              {
                label: 'Updated',
                flex: 1,
                align: 'flex-start',
                maxWidth: 'none',
                render: (item) => (
                  <span style={{ fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}>
                    {formatUpdatedAt(item.updatedAt)}
                  </span>
                ),
              },
              {
                label: '',
                flex: 0.4,
                align: 'flex-end',
                render: (item) => (
                  // §55 — the menu is portaled, so a click inside it is not a click on the
                  // row; `data-row-actions` is what tells `onRowClick` so.
                  <span data-row-actions>
                    <Popover
                      label="Row actions"
                      data-testid={`template-actions-${item.id}`}
                      items={[
                        {
                          label: 'Open',
                          onSelect: () =>
                            router.push(`/org/${orgId}/documents/templates/${item.id}`),
                        },
                        { label: 'Preview', onSelect: () => void preview(item) },
                        ...(canManage && item.status !== 'archived'
                          ? [
                              {
                                label: 'Archive',
                                testId: 'template-archive-btn',
                                onSelect: () => setArchiveTarget(item),
                              },
                            ]
                          : []),
                        ...(canManage
                          ? [
                              {
                                label: 'Delete',
                                testId: 'template-delete-btn',
                                danger: true,
                                onSelect: () => void remove(item),
                              },
                            ]
                          : []),
                      ]}
                    />
                  </span>
                ),
              },
            ]}
            rows={templates}
            rowKey="id"
            rowTestId={(item) => `template-row-${item.id}`}
            rowHref={(item) => `/org/${orgId}/documents/templates/${item.id}`}
            onRowClick={(item, event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) return;
              if ((event.target as HTMLElement).closest('[data-row-actions]')) {
                event.preventDefault();
                return;
              }
              event.preventDefault();
              router.push(`/org/${orgId}/documents/templates/${item.id}`);
            }}
          />
        )}
      </Card>

      {newOpen && (
        <NewTemplateModal
          orgId={orgId}
          onCancel={() => setNewOpen(false)}
          onCreated={(created) => {
            showToast('toast-template-created', TEMPLATE_MESSAGES.toast.created);
            router.push(`/org/${orgId}/documents/templates/${created.id}`);
          }}
        />
      )}

      {/* Both of these are a question and two answers, which is `ConfirmDialog` (§40) and
          not a `Modal` with a paragraph in it. `archive()` closes whichever one is open as
          its first act, so neither needs §41's `closeOnAccept={false}`. */}
      <ConfirmDialog
        open={archiveTarget !== null}
        title="Archive template"
        description={`Archiving “${archiveTarget?.name ?? ''}” cannot be undone. No new documents can be created from it; documents already sent keep working.`}
        declineBtnText="Cancel"
        acceptBtnText="Archive"
        acceptTestId="template-archive-btn"
        onClose={() => setArchiveTarget(null)}
        onAccept={() => archiveTarget && void archive(archiveTarget)}
      />

      <ConfirmDialog
        open={deleteBlocked !== null}
        title="Template in use"
        description={TEMPLATE_MESSAGES.generic.deleteBlocked(deleteBlocked?.count ?? 0)}
        declineBtnText="Close"
        acceptBtnText="Archive"
        acceptTestId="template-archive-btn"
        onClose={() => setDeleteBlocked(null)}
        onAccept={() => deleteBlocked && void archive(deleteBlocked.item)}
      />

      <PreviewModal
        open={previewHtml !== null}
        html={previewHtml ?? ''}
        onClose={() => setPreviewHtml(null)}
      />
    </div>
  );
}

/**
 * Create-template dialog. Client-side rules come from `@devscribed/validation` so the
 * message a caller sees before the request is byte-identical to the one the API would
 * have returned. The CTA is never disabled for validation — submitting an invalid form
 * shows every error and focuses the first one (inherited repository rule).
 */
function NewTemplateModal({
  orgId,
  onCancel,
  onCreated,
}: {
  orgId: string;
  onCancel: () => void;
  onCreated: (created: CreateTemplateResponse) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    const nameResult = validateTemplateName(name);
    const descriptionResult = validateTemplateDescription(description);
    if (!nameResult.valid || !descriptionResult.valid) {
      setErrors({
        name: nameResult.valid ? undefined : nameResult.error,
        description: descriptionResult.valid ? undefined : descriptionResult.error,
      });
      focusByTestId(!nameResult.valid ? 'template-name-input' : 'template-description-input');
      return;
    }

    setErrors({});
    setSubmitting(true);

    const result = await apiRequest<CreateTemplateResponse>(templatesUrl(orgId), {
      method: 'POST',
      body: JSON.stringify({
        name: nameResult.value,
        description: descriptionResult.value.length > 0 ? descriptionResult.value : null,
      }),
    });

    if (result.ok) {
      onCreated(result.data);
      return;
    }

    setSubmitting(false);
    if (result.failure.error === 'duplicate_name') {
      setErrors({ name: result.failure.message ?? TEMPLATE_MESSAGES.name.duplicate });
      focusByTestId('template-name-input');
      return;
    }
    if (result.failure.errors) {
      setErrors({
        name: result.failure.errors.name,
        description: result.failure.errors.description,
      });
      return;
    }
    setErrors({ name: failureMessage(result.failure) });
  }

  return (
    <Modal open title="New template" onClose={onCancel}>
      <form onSubmit={submit} noValidate data-testid="template-new-modal">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-7)' }}>
          <TextInput
            label="Name"
            value={name}
            placeholder="Contractor agreement BY"
            data-testid="template-name-input"
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              const result = validateTemplateName(name);
              setErrors((prev) => ({ ...prev, name: result.valid ? undefined : result.error }));
            }}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'field-error-name' : undefined}
            error={errors.name}
            errorId="field-error-name"
            wrapperStyle={{ gap: 0 }}
          />
          <TextInput
            label="Description"
            value={description}
            data-testid="template-description-input"
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => {
              const result = validateTemplateDescription(description);
              setErrors((prev) => ({
                ...prev,
                description: result.valid ? undefined : result.error,
              }));
            }}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? 'field-error-description' : undefined}
            error={errors.description}
            errorId="field-error-description"
            wrapperStyle={{ gap: 0 }}
          />
        </div>

        <div style={{ marginTop: 'var(--space-9)' }}>
          <FormActions>
            <Button type="button" data-testid="template-new-cancel-btn" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              preloader={submitting}
              data-testid="template-new-submit-btn"
            >
              Create template
            </Button>
          </FormActions>
        </div>
      </form>
    </Modal>
  );
}
