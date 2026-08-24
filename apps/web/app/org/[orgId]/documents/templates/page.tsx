'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  TEMPLATE_MESSAGES,
  validateTemplateDescription,
  validateTemplateName,
} from '@devscribed/validation';
import { Badge, Button, Card, Input, Modal, SearchField, Select, Spinner } from '@/ds';
import { errorNode, focusByTestId } from '@/field-error';
import { PageHeader } from '@/layout/PageHeader';
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
import { RowMenu } from '@/documents/RowMenu';
import { ToastProvider, useToast } from '@/documents/toast';

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
  return (
    <ToastProvider>
      <TemplatesScreen orgId={orgId} />
    </ToastProvider>
  );
}

function TemplatesScreen({ orgId }: { orgId: string }) {
  const router = useRouter();
  const toast = useToast();

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
      toast.show({ testId: 'toast-template-error', message: failureMessage(result.failure), tone: 'error' });
      return;
    }
    toast.show({
      testId: 'toast-template-archived',
      message: TEMPLATE_MESSAGES.toast.archived,
      tone: 'success',
    });
    await load();
  }

  async function remove(item: TemplateListItem): Promise<void> {
    const result = await apiRequest(templateUrl(orgId, item.id), { method: 'DELETE' });
    if (!result.ok) {
      if (result.failure.error === 'template_in_use') {
        setDeleteBlocked({ item, count: result.failure.envelopeCount ?? item.envelopeCount });
        return;
      }
      toast.show({ testId: 'toast-template-error', message: failureMessage(result.failure), tone: 'error' });
      return;
    }
    toast.show({
      testId: 'toast-template-deleted',
      message: TEMPLATE_MESSAGES.toast.deleted,
      tone: 'success',
    });
    await load();
  }

  async function preview(item: TemplateListItem): Promise<void> {
    const result = await apiRequest<{ html: string }>(`${templateUrl(orgId, item.id)}/preview`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (!result.ok) {
      toast.show({ testId: 'toast-template-error', message: failureMessage(result.failure), tone: 'error' });
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
            gap: 'var(--sp-6)',
            alignItems: 'center',
            padding: 'var(--sp-8) var(--sp-10)',
          }}
        >
          <SearchField
            placeholder="Search templates"
            value={query}
            data-testid="template-search-input"
            onChange={(event) => setQuery(event.target.value)}
            style={{ flex: 1 }}
          />
          <Select
            value={status}
            options={STATUS_OPTIONS}
            onChange={setStatus}
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
              padding: 'var(--sp-20)',
              color: 'var(--accent)',
            }}
          >
            <Spinner size={28} />
          </div>
        )}

        {!loading && templates.length === 0 && !filtered && (
          <div
            data-testid="template-empty"
            style={{
              padding: 'var(--sp-20)',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 'var(--fs-15)',
              borderTop: '1px solid var(--divider)',
            }}
          >
            {TEMPLATE_MESSAGES.generic.emptyState}
          </div>
        )}

        {!loading && templates.length === 0 && filtered && (
          <div
            style={{
              padding: 'var(--sp-20)',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 'var(--fs-14)',
              borderTop: '1px solid var(--divider)',
            }}
          >
            No templates match this search.
          </div>
        )}

        {!loading && templates.length > 0 && (
          // Hand-rolled rather than the DS `Table`: the spec requires a
          // `template-row-{id}` handle on the row element itself, and `Table` exposes no
          // per-row attributes. The geometry and tokens below mirror `Table`'s so the two
          // are indistinguishable on screen — the members list sets the same precedent.
          <div data-testid="templates-table">
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
              <span style={{ flex: 3 }}>Name</span>
              <span style={{ flex: 1 }}>Version</span>
              <span style={{ flex: 1 }}>Status</span>
              <span style={{ flex: 1 }}>Updated</span>
              <span style={{ width: 44 }} />
            </div>

            {templates.map((item) => (
              <div
                key={item.id}
                data-testid={`template-row-${item.id}`}
                style={{
                  display: 'flex',
                  minHeight: 62,
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
                    href={`/org/${orgId}/documents/templates/${item.id}`}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                      event.preventDefault();
                      router.push(`/org/${orgId}/documents/templates/${item.id}`);
                    }}
                    style={{ color: 'var(--text)', textDecoration: 'none' }}
                  >
                    {item.name}
                  </a>
                </span>
                <span
                  style={{
                    flex: 1,
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                    fontSize: 'var(--fs-14)',
                  }}
                >
                  {item.currentVersionNumber ? `v${item.currentVersionNumber}` : '—'}
                  {item.hasOpenDraft && (
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> + draft</span>
                  )}
                </span>
                <span style={{ flex: 1 }}>
                  <Badge tone={statusTone(item.status)} data-testid={`template-status-${item.id}`}>
                    {statusLabel(item.status)}
                  </Badge>
                </span>
                <span style={{ flex: 1, fontSize: 'var(--fs-14)', color: 'var(--text-muted)' }}>
                  {formatUpdatedAt(item.updatedAt)}
                </span>
                <span style={{ width: 44, display: 'flex', justifyContent: 'flex-end' }}>
                  <RowMenu
                    testId={`template-actions-${item.id}`}
                    items={[
                      {
                        label: 'Open',
                        onSelect: () => router.push(`/org/${orgId}/documents/templates/${item.id}`),
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
              </div>
            ))}
          </div>
        )}
      </Card>

      {newOpen && (
        <NewTemplateModal
          orgId={orgId}
          onCancel={() => setNewOpen(false)}
          onCreated={(created) => {
            toast.show({
              testId: 'toast-template-created',
              message: TEMPLATE_MESSAGES.toast.created,
              tone: 'success',
            });
            router.push(`/org/${orgId}/documents/templates/${created.id}`);
          }}
        />
      )}

      <Modal
        open={archiveTarget !== null}
        title="Archive template"
        onClose={() => setArchiveTarget(null)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setArchiveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              data-testid="template-archive-btn"
              onClick={() => archiveTarget && void archive(archiveTarget)}
            >
              Archive
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}>
          Archiving “{archiveTarget?.name}” cannot be undone. No new documents can be created from
          it; documents already sent keep working.
        </p>
      </Modal>

      <Modal
        open={deleteBlocked !== null}
        title="Template in use"
        onClose={() => setDeleteBlocked(null)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setDeleteBlocked(null)}>
              Close
            </Button>
            <Button
              variant="danger"
              data-testid="template-archive-btn"
              onClick={() => deleteBlocked && void archive(deleteBlocked.item)}
            >
              Archive
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}>
          {TEMPLATE_MESSAGES.generic.deleteBlocked(deleteBlocked?.count ?? 0)}
        </p>
      </Modal>

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-7)' }}>
          <Input
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
            error={errors.name ? errorNode('name', errors.name) : undefined}
            wrapperStyle={{ gap: 0 }}
          />
          <Input
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
            error={errors.description ? errorNode('description', errors.description) : undefined}
            wrapperStyle={{ gap: 0 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 'var(--sp-5)', marginTop: 'var(--sp-10)' }}>
          <Button
            type="button"
            variant="secondary"
            data-testid="template-new-cancel-btn"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            data-testid="template-new-submit-btn"
          >
            Create template
          </Button>
        </div>
      </form>
    </Modal>
  );
}
