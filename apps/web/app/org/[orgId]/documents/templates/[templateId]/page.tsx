'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { TEMPLATE_MESSAGES } from '@devscribed/validation';
import {
  Button,
  Card,
  ConfirmDialog,
  FormActions,
  InfoBanner,
  TextArea,
  TextInput,
  Modal,
  Select,
  Preloader,
  PageTabs,
} from '@devscribed/ds';
import { valueOf } from '@/select';
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
import { useToast } from '@/toast';

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
  return <EditorScreen orgId={orgId} templateId={templateId} />;
}

function EditorScreen({ orgId, templateId }: { orgId: string; templateId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
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

  /**
   * The editor state as of this render, readable from inside a save that was queued
   * earlier. A queued save must send what the buffer holds when it finally runs, not the
   * snapshot its closure captured when it was asked for — above all `rowVersion`, which
   * the save ahead of it in the queue has just moved on.
   */
  const latest = useRef({ body, fields, signers, rowVersion });
  latest.current = { body, fields, signers, rowVersion };

  /**
   * The save in flight, if any. Saves are serialized through it, and that is a
   * correctness guard rather than politeness: two overlapping PUTs both carry the
   * `rowVersion` they read before either returned, so the server accepts the first and
   * rejects the second as a conflict — and this screen then tells the author their
   * template was "changed by someone else" when the someone else was their own previous
   * keystroke. It never happens on a developer's machine, where a save round-trips in
   * single-digit milliseconds; it happens as soon as there is a network, which is what
   * the deployed suite caught (TC-01-E2E-01).
   */
  const inFlight = useRef<Promise<boolean> | null>(null);

  /**
   * Bumped with every edit so the autosave timer below restarts. The cadence the spec
   * asks for is two seconds of *idle*, and until now that came for free from `save`
   * changing identity on every keystroke — a property of `useCallback` dependencies, not
   * a decision. `save` no longer depends on the buffer, so the reset is explicit.
   */
  const [editTick, setEditTick] = useState(0);

  const load = useCallback(async (): Promise<void> => {
    const result = await apiRequest<TemplateDetail>(url);
    if (!result.ok) {
      // 403 (no capability) and 404 (foreign org, per OrgScopeGuard) both mean this page
      // does not exist for the caller.
      if (result.failure.status === 403 || result.failure.status === 404) setGone(true);
      return;
    }

    const data = result.data;
    setDetail(data);

    /**
     * Seed the editable buffer only while there is nothing in it worth keeping.
     *
     * `load` runs from an effect, and an effect can run more than once — React's
     * StrictMode double-invokes them in development, and a remount re-runs them anywhere.
     * A second resolution arriving after the author has typed used to overwrite the
     * buffer, reset `saveState` to `saved`, and re-lock a published template they had
     * just unlocked: the edit vanished, nothing looked dirty, so nothing was ever saved.
     * It reads as "my change did not stick" and it is the same shape of bug as the two
     * fixed on this screen already — late state clobbering live state.
     *
     * `revision.current` is the count of local edits, so zero means the buffer is exactly
     * what the server last gave us and re-seeding it is free.
     */
    // Version numbers and validation describe the server's state, not the author's, so
    // they are always adopted — a reload after publishing has to be able to say so.
    setPublishedVersion(data.currentVersion?.versionNumber ?? null);
    setDraftVersion(data.draftVersion?.versionNumber ?? null);
    setValidation(data.validation);

    if (revision.current > 0) return;

    const source = data.draftVersion ?? data.currentVersion;
    setBody(data.draftVersion?.bodyHtml ?? data.currentVersion?.bodyHtml ?? '');
    setFields(source?.fields ?? []);
    setSigners(
      source?.signerRoles && source.signerRoles.length === 2 ? source.signerRoles : EMPTY_SIGNERS,
    );
    setRowVersion(data.draftVersion?.rowVersion ?? 0);
    setSaveState('saved');
    setEditUnlocked(false);
    setPublishError(null);
    setRemovedElements([]);
  }, [url]);

  /** Drop the local copy and take the server's. The only way out of the stale dialog. */
  const reload = useCallback((): void => {
    setStaleBody(null);
    void load();
  }, [load]);

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
    setEditTick((tick) => tick + 1);
    setSaveState('dirty');
  }

  /**
   * One PUT. Never called directly — `save` below is what guarantees only one of these is
   * ever in flight.
   */
  const flush = useCallback(async (): Promise<boolean> => {
    const sentRevision = revision.current;
    // Read at the moment the request is actually built, not when the save was asked for.
    const { body: sentBody, fields: sentFields, signers: sentSigners, rowVersion: sentRowVersion } =
      latest.current;
    setSaveState('saving');

    const result = await apiRequest<DraftSaveResponse>(`${url}/draft`, {
      method: 'PUT',
      body: JSON.stringify({
        rowVersion: sentRowVersion,
        bodyHtml: sentBody,
        signerRoles: sentSigners.map((signer, index) => ({ ...signer, order: index + 1 })),
        fields: sentFields.map((field, index) => ({ ...field, order: index + 1 })),
      }),
    });

    if (!result.ok) {
      setSaveState('dirty');
      if (result.failure.error === 'stale_version') {
        // A genuine conflict now: this tab is the only writer it can be racing, and it
        // no longer races itself.
        setStaleBody(sentBody);
        return false;
      }
      showToast('toast-template-error', failureMessage(result.failure), 'error');
      return false;
    }

    setRowVersion(result.data.rowVersion);
    // The ref too, and before the next queued save can read it: `setRowVersion` only
    // reaches `latest` on the next render, which is a turn too late for a save that is
    // already waiting behind this one.
    latest.current = { ...latest.current, rowVersion: result.data.rowVersion };
    setDraftVersion(result.data.versionNumber);
    setValidation(result.data.validation);
    setRemovedElements(result.data.removedElements ?? []);

    if (revision.current === sentRevision) {
      // The stored body is the sanitized one — adopting it is what makes "what you saved
      // is what will render" true in the editor as well as on the server.
      setBody(result.data.bodyHtml);
      latest.current = { ...latest.current, body: result.data.bodyHtml };
      setSaveState('saved');
    } else {
      setSaveState('dirty');
    }

    showToast('toast-template-saved', TEMPLATE_MESSAGES.toast.saved);
    return true;
  }, [showToast, url]);

  /**
   * Flush the buffer, waiting out whatever is already flushing.
   *
   * Callers get a promise that resolves once *their* turn has run, so `publish` can still
   * say "save, then publish" and mean it.
   */
  const save = useCallback((): Promise<boolean> => {
    if (!canEdit) return Promise.resolve(false);

    const mine = (inFlight.current ?? Promise.resolve(true))
      // A failed save must not poison the queue: the next one is a fresh attempt, and
      // whether the previous succeeded is the previous caller's business.
      .catch(() => false)
      .then(() => flush());

    // What the *next* caller waits on. Never rejects, so nobody inherits a rejection.
    const tracked = mine.catch(() => false);
    inFlight.current = tracked;
    void tracked.then(() => {
      // Only clear it if nothing has queued behind us in the meantime.
      if (inFlight.current === tracked) inFlight.current = null;
    });

    return mine;
  }, [canEdit, flush]);

  // `editTick` is what makes this two seconds of *idle* rather than two seconds from the
  // first edit: every keystroke restarts the timer.
  useEffect(() => {
    if (saveState !== 'dirty' || !canEdit) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_IDLE_MS);
    return () => clearTimeout(timer);
  }, [saveState, editTick, canEdit, save]);

  if (gone) notFound();

  if (!detail) {
    return (
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
    // Unconditionally, not only when dirty. The button is disabled while a save is in
    // flight, but a save can also be queued behind one, and publishing a version the
    // server has not been told about yet publishes the wrong text.
    if (saveState === 'dirty' || inFlight.current) {
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

    showToast('toast-template-published', TEMPLATE_MESSAGES.toast.published);
    // The buffer is no longer ahead of the server — publishing flushed it on the way in —
    // so the reload below is allowed to seed from the freshly published version. Without
    // this the editor keeps showing a draft that no longer exists.
    revision.current = 0;
    await load();
  }

  async function archive(): Promise<void> {
    setArchiveOpen(false);
    setDeleteBlocked(null);
    const result = await apiRequest(`${url}/archive`, { method: 'POST' });
    if (!result.ok) {
      showToast('toast-template-error', failureMessage(result.failure), 'error');
      return;
    }
    showToast('toast-template-archived', TEMPLATE_MESSAGES.toast.archived);
    // Archiving freezes the template; whatever was in the buffer is moot.
    revision.current = 0;
    await load();
  }

  async function remove(): Promise<void> {
    const result = await apiRequest(url, { method: 'DELETE' });
    if (!result.ok) {
      if (result.failure.error === 'template_in_use') {
        setDeleteBlocked(result.failure.envelopeCount ?? 0);
        return;
      }
      showToast('toast-template-error', failureMessage(result.failure), 'error');
      return;
    }
    showToast('toast-template-deleted', TEMPLATE_MESSAGES.toast.deleted);
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
      showToast('toast-template-error', failureMessage(result.failure), 'error');
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
          <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
            <span
              data-testid="template-save-state"
              style={{ fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}
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
                onChange={(option) => void preview(valueOf(option))}
                data-testid="template-version-picker"
                wrapperStyle={{ minWidth: 210 }}
                // Sized down to the header's button row rather than the form default.
                style={{ height: 'var(--control-height)', fontSize: 'var(--font-size-s)' }}
              />
            )}
            <Button data-testid="template-preview-btn" onClick={() => void preview()}>
              Preview
            </Button>
            {canManage && !archived && (
              <Button
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
              <Button variant="delete" data-testid="template-delete-btn" onClick={() => void remove()}>
                Delete
              </Button>
            )}
          </div>
        }
      />

      <div
        data-testid="template-version-summary"
        style={{
          marginTop: 'calc(-1 * var(--space-5))',
          marginBottom: 'var(--space-6)',
          fontSize: 'var(--font-size-s)',
          color: 'var(--text-secondary)',
        }}
      >
        {versionSummary(publishedVersion, draftVersion)}
      </div>

      {archived && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <InfoBanner variant="warning">{TEMPLATE_MESSAGES.generic.archived}</InfoBanner>
        </div>
      )}

      {removedElements.length > 0 && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <InfoBanner variant="warning">
            {TEMPLATE_MESSAGES.body.sanitizerRemoved(removedElements)}
          </InfoBanner>
        </div>
      )}

      {uniqueLines.length > 0 && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <InfoBanner variant="warning" data-testid="template-validation-banner">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
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
        <PageTabs
          tabs={[
            { value: 'body', label: 'Body', testId: 'template-tab-body' },
            { value: 'fields', label: 'Fields', testId: 'template-tab-fields' },
            { value: 'signers', label: 'Signers', testId: 'template-tab-signers' },
          ]}
          active={tab}
          onChange={(next) => changeTab(next as Tab)}
          style={{ marginBottom: 'var(--space-7)' }}
        />
      </div>

      {tab === 'body' && (
        <>
          {publishedNoDraft && !editUnlocked && canEdit && (
            <div style={{ marginBottom: 'var(--space-5)' }}>
              {/* Editing a published template is a version-creating act, so it asks
                  first rather than silently spawning draft v{n+1} on a stray keystroke. */}
              <InfoBanner variant="info">
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}>
                  This version is published and read-only. Editing starts a new draft.
                  <Button onClick={() => setEditUnlocked(true)}>
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
                  padding: 'var(--space-10)',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--font-size-s)',
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
                  gap: 'var(--space-5)',
                  padding: 'var(--space-7) var(--space-7)',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-family-mono)',
                      fontSize: 'var(--font-size-s)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {`{{${field.key}}}`}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}>
                    {field.label} · {field.type}
                    {field.required ? ' · Required' : ''} · Filled by:{' '}
                    {field.filledBy === 'sender' ? 'Sender' : field.filledBy.replace('signer:', '')} ·
                    Autofill: {field.autofillSource ?? '—'}
                  </div>
                </div>

                {canEdit && (
                  <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                    <Button
                      aria-label={`Move ${field.key} up`}
                      onClick={() => moveField(index, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      aria-label={`Move ${field.key} down`}
                      onClick={() => moveField(index, 1)}
                    >
                      ↓
                    </Button>
                    <Button
                      onClick={() => setFieldModal({ initial: field })}
                    >
                      Edit
                    </Button>
                    <Button onClick={() => removeField(field.key)}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {signers.map((signer, index) => (
              <div
                key={index}
                data-testid={`template-signer-row-${index + 1}`}
                style={{ display: 'flex', gap: 'var(--space-5)', alignItems: 'flex-end' }}
              >
                <span
                  style={{
                    fontSize: 'var(--font-size-base)',
                    color: 'var(--text-secondary)',
                    paddingBottom: 'var(--space-5)',
                  }}
                >
                  {index + 1}.
                </span>
                <TextInput
                  label="Key"
                  value={signer.key}
                  placeholder={index === 0 ? 'company' : 'contractor'}
                  readOnly={!canEdit}
                  data-testid={`template-signer-key-${index + 1}`}
                  onChange={(event) => editSigner(index, { key: event.target.value })}
                  wrapperStyle={{ flex: 1 }}
                />
                <TextInput
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
          <p style={{ marginBottom: 0, fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}>
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

      {/* A question and two answers is `ConfirmDialog` (§40), not a `Modal` with a
          paragraph in it. `archive()` closes whichever one is open as its first act. */}
      <ConfirmDialog
        open={archiveOpen}
        title="Archive template"
        description="Archiving cannot be undone. No new documents can be created from this template; documents already sent keep working."
        declineBtnText="Cancel"
        acceptBtnText="Archive"
        onClose={() => setArchiveOpen(false)}
        onAccept={() => void archive()}
      />

      <ConfirmDialog
        open={deleteBlocked !== null}
        title="Template in use"
        description={TEMPLATE_MESSAGES.generic.deleteBlocked(deleteBlocked ?? 0)}
        declineBtnText="Close"
        acceptBtnText="Archive"
        onClose={() => setDeleteBlocked(null)}
        onAccept={() => void archive()}
      />

      {/* Reload is destructive to unsaved work, so the local body is offered for copying
          before the server's version replaces it. */}
      {/* Reload is the only way out — there is nothing to go back to — so `Escape` and the
          button do the same thing rather than `Escape` doing nothing. */}
      <Modal
        open={staleBody !== null}
        title="Changed by someone else"
        onClose={reload}
        style={{ width: 640 }}
      >
        <p style={{ marginTop: 0, fontSize: 'var(--font-size-s)', color: 'var(--text-tertiary)' }}>
          {TEMPLATE_MESSAGES.generic.stale}
        </p>
        <TextArea
          readOnly
          value={staleBody ?? ''}
          label="Your unsaved body"
          style={{
            minHeight: 200,
            fontFamily: 'var(--font-family-mono)',
            background: 'var(--surface-sunken)',
          }}
        />

        <div style={{ marginTop: 'var(--space-9)' }}>
          <FormActions>
            <Button variant="primary" onClick={reload}>
              Reload
            </Button>
          </FormActions>
        </div>
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
        marginRight: 'var(--space-2)',
        cursor: 'pointer',
        fontFamily: 'var(--font-family-mono)',
        fontSize: 'var(--font-size-s)',
        color: 'var(--action-primary)',
        textDecoration: 'underline',
      }}
    >
      {label}
    </button>
  );
}
