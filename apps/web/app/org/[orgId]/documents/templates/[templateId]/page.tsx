'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { TEMPLATE_MESSAGES } from '@devscribed/validation';
import { Button, Card, InfoBanner, Input, Modal, Select, Spinner, Tabs } from '@/ds';
import { focusByTestId } from '@/field-error';
import { PageHeader } from '@/layout/PageHeader';
import {
  apiRequest,
  failureMessage,
  templateUrl,
  type DraftSaveResponse,
  type PublishResponse,
  type SignerRoleDto,
  type TemplateDetail,
  type TemplateFieldDto,
  type TemplateValidation,
  type TemplateVersionSummary,
} from '@/documents/api';
import { BodyEditor } from '@/documents/BodyEditor';
import { FieldModal } from '@/documents/FieldModal';
import { versionOptionLabel, versionSummary } from '@/documents/format';
import { PreviewModal } from '@/documents/PreviewModal';
import { ToastProvider, useToast } from '@/documents/toast';

type Tab = 'body' | 'fields' | 'signers';
type SaveState = 'saved' | 'saving' | 'dirty';

const SAVE_LABEL: Record<SaveState, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  dirty: 'Unsaved changes',
};

/** The spec's autosave cadence: two seconds of idle, plus an explicit save on tab change. */
const AUTOSAVE_IDLE_MS = 2000;

const EMPTY_SIGNERS: SignerRoleDto[] = [
  { key: '', label: '', order: 1 },
  { key: '', label: '', order: 2 },
];

export default function TemplateEditorPage({
  params,
}: {
  params: Promise<{ orgId: string; templateId: string }>;
}) {
  const { orgId, templateId } = use(params);
  return (
    <ToastProvider>
      <EditorScreen orgId={orgId} templateId={templateId} />
    </ToastProvider>
  );
}

function EditorScreen({ orgId, templateId }: { orgId: string; templateId: string }) {
  const router = useRouter();
  const toast = useToast();
  const url = templateUrl(orgId, templateId);

  const [detail, setDetail] = useState<TemplateDetail | null>(null);
  const [gone, setGone] = useState(false);
  const [tab, setTab] = useState<Tab>('body');

  // The editable buffer. It is seeded from the draft version (or, for a published
  // template with no draft, from the current version) and replaced by the sanitized
  // body the server returns on every save.
  const [body, setBody] = useState('');
  const [fields, setFields] = useState<TemplateFieldDto[]>([]);
  const [signers, setSigners] = useState<SignerRoleDto[]>(EMPTY_SIGNERS);
  const [rowVersion, setRowVersion] = useState(0);
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);

  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [validation, setValidation] = useState<TemplateValidation>({
    unknownPlaceholders: [],
    unusedFields: [],
  });
  const [removedElements, setRemovedElements] = useState<string[]>([]);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [editUnlocked, setEditUnlocked] = useState(false);
  const [fieldModal, setFieldModal] = useState<{
    initial: TemplateFieldDto | null;
    prefillKey?: string;
  } | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteBlocked, setDeleteBlocked] = useState<number | null>(null);
  const [staleBody, setStaleBody] = useState<string | null>(null);

  /**
   * Bumped on every local edit. A save that finishes while the author kept typing must
   * not claim "Saved" for a buffer that has moved on, so the response is only allowed to
   * settle the indicator when the revision it was sent for is still current.
   */
  const revision = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const result = await apiRequest<TemplateDetail>(url);
    if (!result.ok) {
      // 403 (no capability) and 404 (foreign org, per OrgScopeGuard) both mean this page
      // does not exist for the caller.
      if (result.failure.status === 403 || result.failure.status === 404) setGone(true);
      return;
    }

    const data = result.data;
    const source = data.draftVersion ?? data.currentVersion;
    setDetail(data);
    setBody(data.draftVersion?.bodyHtml ?? data.currentVersion?.bodyHtml ?? '');
    setFields(source?.fields ?? []);
    setSigners(
      source?.signerRoles && source.signerRoles.length === 2 ? source.signerRoles : EMPTY_SIGNERS,
    );
    setRowVersion(data.draftVersion?.rowVersion ?? 0);
    setPublishedVersion(data.currentVersion?.versionNumber ?? null);
    setDraftVersion(data.draftVersion?.versionNumber ?? null);
    setValidation(data.validation);
    setSaveState('saved');
    setEditUnlocked(false);
    setPublishError(null);
    setRemovedElements([]);
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  const canManage = detail?.canManage ?? false;
  const archived = detail?.status === 'archived';
  const canEdit = canManage && !archived;
  const publishedNoDraft = detail !== null && detail.draftVersion === null && publishedVersion !== null;
  const readOnly = !canEdit || (publishedNoDraft && !editUnlocked);
  /**
   * The version history, newest first. `Array.isArray` rather than `?? []` because the
   * field is newer than this screen: an API that has not grown it yet — or that sends
   * something unexpected in its place — must leave the picker unrendered, not throw.
   */
  const versions: TemplateVersionSummary[] = Array.isArray(detail?.versions)
    ? detail.versions
    : [];

  function markDirty(): void {
    revision.current += 1;
    setSaveState('dirty');
  }

  const save = useCallback(async (): Promise<boolean> => {
    if (!canEdit) return false;
    const sentRevision = revision.current;
    setSaveState('saving');

    const result = await apiRequest<DraftSaveResponse>(`${url}/draft`, {
      method: 'PUT',
      body: JSON.stringify({
        rowVersion,
        bodyHtml: body,
        signerRoles: signers.map((signer, index) => ({ ...signer, order: index + 1 })),
        fields: fields.map((field, index) => ({ ...field, order: index + 1 })),
      }),
    });

    if (!result.ok) {
      setSaveState('dirty');
      if (result.failure.error === 'stale_version') {
        setStaleBody(body);
        return false;
      }
      toast.show({
        testId: 'toast-template-error',
        message: failureMessage(result.failure),
        tone: 'error',
      });
      return false;
    }

    setRowVersion(result.data.rowVersion);
    setDraftVersion(result.data.versionNumber);
    setValidation(result.data.validation);
    setRemovedElements(result.data.removedElements ?? []);

    if (revision.current === sentRevision) {
      // The stored body is the sanitized one — adopting it is what makes "what you saved
      // is what will render" true in the editor as well as on the server.
      setBody(result.data.bodyHtml);
      setSaveState('saved');
    } else {
      setSaveState('dirty');
    }

    toast.show({
      testId: 'toast-template-saved',
      message: TEMPLATE_MESSAGES.toast.saved,
      tone: 'success',
    });
    return true;
  }, [body, canEdit, fields, rowVersion, signers, toast, url]);

  useEffect(() => {
    if (saveState !== 'dirty' || !canEdit) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_IDLE_MS);
    return () => clearTimeout(timer);
  }, [saveState, canEdit, save]);

  if (gone) notFound();

  if (!detail) {
    return (
      <div
        data-testid="template-loading"
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: 'var(--sp-24)',
          color: 'var(--accent)',
        }}
      >
        <Spinner size={28} />
      </div>
    );
  }

  function changeTab(next: Tab): void {
    // An explicit save on tab change, so leaving the Body tab can never strand an edit
    // inside the 2-second idle window.
    if (saveState === 'dirty' && canEdit) void save();
    setTab(next);
  }

  async function publish(): Promise<void> {
    setPublishError(null);
    if (saveState === 'dirty') {
      const saved = await save();
      if (!saved) return;
    }

    const result = await apiRequest<PublishResponse>(`${url}/publish`, { method: 'POST' });
    if (!result.ok) {
      if (result.failure.error === 'unknown_placeholders') {
        const keys = result.failure.keys ?? [];
        setValidation((current) => ({ ...current, unknownPlaceholders: keys }));
        setPublishError(TEMPLATE_MESSAGES.body.unknownPlaceholders(keys));
        return;
      }
      if (result.failure.error === 'invalid_signer_roles') {
        setPublishError(TEMPLATE_MESSAGES.signer.invalidCount);
        setTab('signers');
        return;
      }
      if (result.failure.error === 'empty_body') {
        setPublishError(TEMPLATE_MESSAGES.body.empty);
        return;
      }
      setPublishError(failureMessage(result.failure));
      return;
    }

    toast.show({
      testId: 'toast-template-published',
      message: TEMPLATE_MESSAGES.toast.published,
      tone: 'success',
    });
    await load();
  }

  async function archive(): Promise<void> {
    setArchiveOpen(false);
    setDeleteBlocked(null);
    const result = await apiRequest(`${url}/archive`, { method: 'POST' });
    if (!result.ok) {
      toast.show({
        testId: 'toast-template-error',
        message: failureMessage(result.failure),
        tone: 'error',
      });
      return;
    }
    toast.show({
      testId: 'toast-template-archived',
      message: TEMPLATE_MESSAGES.toast.archived,
      tone: 'success',
    });
    await load();
  }

  async function remove(): Promise<void> {
    const result = await apiRequest(url, { method: 'DELETE' });
    if (!result.ok) {
      if (result.failure.error === 'template_in_use') {
        setDeleteBlocked(result.failure.envelopeCount ?? 0);
        return;
      }
      toast.show({
        testId: 'toast-template-error',
        message: failureMessage(result.failure),
        tone: 'error',
      });
      return;
    }
    toast.show({
      testId: 'toast-template-deleted',
      message: TEMPLATE_MESSAGES.toast.deleted,
      tone: 'success',
    });
    router.push(`/org/${orgId}/documents/templates`);
  }

  /**
   * With no argument this previews what the editor is showing (the draft if there is one,
   * otherwise the published body). `versionId` is how the version-history picker asks for
   * an *older* version — the same endpoint, the same modal, a different version.
   */
  async function preview(versionId?: string): Promise<void> {
    const result = await apiRequest<{ html: string }>(`${url}/preview`, {
      method: 'POST',
      body: JSON.stringify(
        versionId
          ? { versionId }
          : detail?.draftVersion || draftVersion !== null
            ? {}
            : { versionId: detail?.currentVersion?.id },
      ),
    });
    if (!result.ok) {
      toast.show({
        testId: 'toast-template-error',
        message: failureMessage(result.failure),
        tone: 'error',
      });
      return;
    }
    setPreviewHtml(result.data.html);
  }

  /** The published body becomes editable on demand; the first change creates the draft. */
  function editBody(next: string): void {
    setBody(next);
    markDirty();
  }

  function saveField(field: TemplateFieldDto): void {
    setFields((current) => {
      const existing = current.findIndex(
        (candidate) => candidate.key === fieldModal?.initial?.key,
      );
      if (existing >= 0) {
        const next = [...current];
        next[existing] = { ...field, order: existing + 1 };
        return next;
      }
      return [...current, { ...field, order: current.length + 1 }];
    });
    setFieldModal(null);
    markDirty();
  }

  function moveField(index: number, delta: number): void {
    setFields((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((field, position) => ({ ...field, order: position + 1 }));
    });
    markDirty();
  }

  function removeField(key: string): void {
    setFields((current) => current.filter((field) => field.key !== key));
    markDirty();
  }

  function editSigner(index: number, patch: Partial<SignerRoleDto>): void {
    setSigners((current) =>
      current.map((signer, position) => (position === index ? { ...signer, ...patch } : signer)),
    );
    markDirty();
  }

  const bannerLines = [
    ...(publishError ? [publishError] : []),
    ...(validation.unknownPlaceholders.length > 0
      ? [TEMPLATE_MESSAGES.body.unknownPlaceholders(validation.unknownPlaceholders)]
      : []),
    ...(validation.unusedFields.length > 0
      ? [TEMPLATE_MESSAGES.body.unusedFields(validation.unusedFields.length)]
      : []),
  ];
  // A duplicate line is possible when the publish failure and the advisory validation
  // both name the same keys; the banner states each sentence once.
  const uniqueLines = Array.from(new Set(bannerLines));

  return (
    <div data-testid="template-editor">
      <PageHeader
        title={detail.name}
        subtitle={detail.description ?? undefined}
        action={
          <div style={{ display: 'flex', gap: 'var(--sp-5)', alignItems: 'center' }}>
            <span
              data-testid="template-save-state"
              style={{ fontSize: 'var(--fs-13)', color: 'var(--text-muted)' }}
            >
              {SAVE_LABEL[saveState]}
            </span>
            {/*
              The version history. Until now the header only ever named the current and
              draft numbers, so there was no way to look at what v1 actually said. The
              control is a menu rather than a stateful field: picking an entry opens the
              read-only preview for it and the picker falls straight back to its
              placeholder, because nothing on this page is "on" the old version.
            */}
            {versions.length > 0 && (
              <Select
                value=""
                placeholder="Version history"
                options={versions.map((version) => ({
                  value: version.id,
                  label: versionOptionLabel(version),
                }))}
                onChange={(versionId: string) => void preview(versionId)}
                data-testid="template-version-picker"
                wrapperStyle={{ minWidth: 210 }}
                // Sized down to the header's button row rather than the form default.
                style={{ height: 'var(--field-h-sm)', fontSize: 'var(--fs-14)' }}
              />
            )}
            <Button variant="secondary" data-testid="template-preview-btn" onClick={() => void preview()}>
              Preview
            </Button>
            {canManage && !archived && (
              <Button
                variant="secondary"
                data-testid="template-archive-btn"
                onClick={() => setArchiveOpen(true)}
              >
                Archive
              </Button>
            )}
            {canManage && !archived && (
              <Button
                variant="primary"
                data-testid="template-publish-btn"
                // In-flight guard only. The CTA is never disabled for validation — an
                // invalid template is rejected by the server and explained in the banner.
                disabled={saveState === 'saving'}
                onClick={() => void publish()}
              >
                Publish
              </Button>
            )}
            {canManage && (
              <Button variant="danger" data-testid="template-delete-btn" onClick={() => void remove()}>
                Delete
              </Button>
            )}
          </div>
        }
      />

      <div
        data-testid="template-version-summary"
        style={{
          marginTop: 'calc(-1 * var(--sp-6))',
          marginBottom: 'var(--sp-8)',
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-14)',
          color: 'var(--text-muted)',
        }}
      >
        {versionSummary(publishedVersion, draftVersion)}
      </div>

      {archived && (
        <div style={{ marginBottom: 'var(--sp-8)' }}>
          <InfoBanner tone="warning">{TEMPLATE_MESSAGES.generic.archived}</InfoBanner>
        </div>
      )}

      {removedElements.length > 0 && (
        <div style={{ marginBottom: 'var(--sp-8)' }}>
          <InfoBanner tone="warning">
            {TEMPLATE_MESSAGES.body.sanitizerRemoved(removedElements)}
          </InfoBanner>
        </div>
      )}

      {uniqueLines.length > 0 && (
        <div style={{ marginBottom: 'var(--sp-8)' }}>
          <InfoBanner tone="warning" data-testid="template-validation-banner">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              {uniqueLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
              {validation.unknownPlaceholders.length > 0 && (
                <span>
                  Create field:{' '}
                  {validation.unknownPlaceholders.map((key) => (
                    <BannerKey
                      key={key}
                      label={key}
                      // A missing field is one click from existing: the modal opens with
                      // the offending key already typed in.
                      onSelect={() => {
                        setTab('fields');
                        setFieldModal({ initial: null, prefillKey: key });
                      }}
                    />
                  ))}
                </span>
              )}
              {validation.unusedFields.length > 0 && (
                <span>
                  Unused:{' '}
                  {validation.unusedFields.map((key) => (
                    <BannerKey
                      key={key}
                      label={key}
                      onSelect={() => {
                        setTab('fields');
                        // Deferred so the Fields tab has rendered the row to focus.
                        requestAnimationFrame(() => focusByTestId(`template-field-row-${key}`));
                      }}
                    />
                  ))}
                </span>
              )}
            </div>
          </InfoBanner>
        </div>
      )}

      <div data-testid="template-tabs">
        <Tabs
          items={[
            { value: 'body', label: <span data-testid="template-tab-body">Body</span> },
            { value: 'fields', label: <span data-testid="template-tab-fields">Fields</span> },
            { value: 'signers', label: <span data-testid="template-tab-signers">Signers</span> },
          ]}
          value={tab}
          onChange={(next) => changeTab(next as Tab)}
          style={{ marginBottom: 'var(--sp-10)' }}
        />
      </div>

      {tab === 'body' && (
        <>
          {publishedNoDraft && !editUnlocked && canEdit && (
            <div style={{ marginBottom: 'var(--sp-6)' }}>
              <InfoBanner
                tone="info"
                icon={null}
                // Editing a published template is a version-creating act, so it asks
                // first rather than silently spawning draft v{n+1} on a stray keystroke.
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-6)' }}>
                  This version is published and read-only. Editing starts a new draft.
                  <Button variant="secondary" size="sm" onClick={() => setEditUnlocked(true)}>
                    Edit
                  </Button>
                </span>
              </InfoBanner>
            </div>
          )}
          <BodyEditor value={body} readOnly={readOnly} onChange={editBody} />
        </>
      )}

      {tab === 'fields' && (
        <Card
          title="Fields"
          padded={false}
          action={
            canEdit ? (
              <Button
                variant="secondary"
                size="sm"
                data-testid="template-field-add-btn"
                onClick={() => setFieldModal({ initial: null })}
              >
                Add field
              </Button>
            ) : undefined
          }
        >
          <div data-testid="template-fields-list">
            {fields.length === 0 && (
              <div
                style={{
                  padding: 'var(--sp-16)',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: 'var(--fs-14)',
                }}
              >
                No fields yet. Every {'{{placeholder}}'} in the body needs one.
              </div>
            )}

            {fields.map((field, index) => (
              <div
                key={field.key}
                tabIndex={-1}
                data-testid={`template-field-row-${field.key}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--sp-6)',
                  padding: 'var(--sp-7) var(--sp-10)',
                  borderTop: '1px solid var(--divider)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--fs-14)',
                      color: 'var(--text)',
                    }}
                  >
                    {`{{${field.key}}}`}
                  </div>
                  <div style={{ fontSize: 'var(--fs-13)', color: 'var(--text-muted)' }}>
                    {field.label} · {field.type}
                    {field.required ? ' · Required' : ''} · Filled by:{' '}
                    {field.filledBy === 'sender' ? 'Sender' : field.filledBy.replace('signer:', '')} ·
                    Autofill: {field.autofillSource ?? '—'}
                  </div>
                </div>

                {canEdit && (
                  <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Move ${field.key} up`}
                      onClick={() => moveField(index, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Move ${field.key} down`}
                      onClick={() => moveField(index, 1)}
                    >
                      ↓
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFieldModal({ initial: field })}
                    >
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => removeField(field.key)}>
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === 'signers' && (
        <Card title="Signer roles">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-8)' }}>
            {signers.map((signer, index) => (
              <div
                key={index}
                data-testid={`template-signer-row-${index + 1}`}
                style={{ display: 'flex', gap: 'var(--sp-6)', alignItems: 'flex-end' }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--fs-15)',
                    color: 'var(--text-muted)',
                    paddingBottom: 'var(--sp-6)',
                  }}
                >
                  {index + 1}.
                </span>
                <Input
                  label="Key"
                  value={signer.key}
                  placeholder={index === 0 ? 'company' : 'contractor'}
                  readOnly={!canEdit}
                  data-testid={`template-signer-key-${index + 1}`}
                  onChange={(event) => editSigner(index, { key: event.target.value })}
                  wrapperStyle={{ flex: 1 }}
                />
                <Input
                  label="Label"
                  value={signer.label}
                  placeholder={index === 0 ? 'Company' : 'Contractor'}
                  readOnly={!canEdit}
                  data-testid={`template-signer-label-${index + 1}`}
                  onChange={(event) => editSigner(index, { label: event.target.value })}
                  wrapperStyle={{ flex: 1 }}
                />
              </div>
            ))}
          </div>
          <p style={{ marginBottom: 0, fontSize: 'var(--fs-13)', color: 'var(--text-muted)' }}>
            Exactly two signer roles are required. Their order is the default signing order; it can
            be changed per envelope.
          </p>
        </Card>
      )}

      {fieldModal && (
        <FieldModal
          initial={fieldModal.initial}
          prefillKey={fieldModal.prefillKey}
          signerRoles={signers}
          usedKeys={fields
            .filter((field) => field.key !== fieldModal.initial?.key)
            .map((field) => field.key)}
          onCancel={() => setFieldModal(null)}
          onSave={saveField}
        />
      )}

      <Modal
        open={archiveOpen}
        title="Archive template"
        onClose={() => setArchiveOpen(false)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setArchiveOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void archive()}>
              Archive
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}>
          Archiving cannot be undone. No new documents can be created from this template; documents
          already sent keep working.
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
            <Button variant="danger" onClick={() => void archive()}>
              Archive
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}>
          {TEMPLATE_MESSAGES.generic.deleteBlocked(deleteBlocked ?? 0)}
        </p>
      </Modal>

      {/* Reload is destructive to unsaved work, so the local body is offered for copying
          before the server's version replaces it. */}
      <Modal
        open={staleBody !== null}
        title="Changed by someone else"
        width={640}
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setStaleBody(null);
              void load();
            }}
          >
            Reload
          </Button>
        }
      >
        <p style={{ marginTop: 0, fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}>
          {TEMPLATE_MESSAGES.generic.stale}
        </p>
        <textarea
          readOnly
          value={staleBody ?? ''}
          aria-label="Your unsaved body"
          style={{
            width: '100%',
            minHeight: 200,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--sp-6)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--fs-13)',
            background: 'var(--bg-sunken)',
            color: 'var(--text)',
          }}
        />
      </Modal>

      <PreviewModal
        open={previewHtml !== null}
        html={previewHtml ?? ''}
        onClose={() => setPreviewHtml(null)}
      />
    </div>
  );
}

/** A key inside the validation banner — clicking it takes the author to the fix. */
function BannerKey({ label, onSelect }: { label: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        border: 'none',
        background: 'transparent',
        padding: 0,
        marginRight: 'var(--sp-3)',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--fs-13)',
        color: 'var(--accent)',
        textDecoration: 'underline',
      }}
    >
      {label}
    </button>
  );
}
