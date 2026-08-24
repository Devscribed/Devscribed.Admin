'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ENVELOPE_LIMITS,
  ENVELOPE_MESSAGES,
  validateEnvelopeTitle,
  validateExpiryDays,
  validateSignerEmail,
  validateSignerName,
} from '@devscribed/validation';
import { Button, Card, InfoBanner, Input, SectionLabel, Select, Spinner } from '@/ds';
import { errorNode, focusByTestId } from '@/field-error';
import { apiRequest, failureMessage } from './api';
import {
  envelopeUrl,
  ownerLabel,
  type EnvelopeDetail,
  type EnvelopeFieldDto,
  type SendEnvelopeResponse,
} from './envelopes';
import { FieldInput, SignerFieldPreview, validateFieldValue } from './FieldInput';
import { PreviewModal } from './PreviewModal';
import { useToast } from './toast';

export interface TemplateChoice {
  id: string;
  name: string;
  currentVersionNumber: number | null;
}

export interface MemberChoice {
  id: string;
  name: string;
}

interface SignerDraft {
  id: string;
  roleKey: string;
  label: string;
  name: string;
  email: string;
  order: number;
}

/**
 * The fill form of spec 02 — the sender's half of an envelope.
 *
 * One component serves both places the spec draws it: `/documents/new`, where the
 * template select is live and picking one creates the envelope, and the envelope
 * detail's Document tab, where the same form is either editable (draft) or a read-only
 * record of what was sent. Two copies of this screen would be two places for the
 * ownership rule — sender fields here, signer fields on the signing page — to drift.
 */
export function FillForm({
  orgId,
  detail,
  templates,
  members,
  templateId,
  subjectId,
  onTemplateChange,
  onSubjectChange,
  creating,
  readOnly,
  onSaved,
  onSent,
}: {
  orgId: string;
  /** `null` until the envelope exists — the template select is the only live control. */
  detail: EnvelopeDetail | null;
  templates: TemplateChoice[];
  members: MemberChoice[];
  templateId: string;
  subjectId: string;
  onTemplateChange: (id: string) => void;
  onSubjectChange: (id: string) => void;
  creating: boolean;
  readOnly: boolean;
  onSaved: (detail: EnvelopeDetail) => void;
  onSent: (response: SendEnvelopeResponse) => void;
}) {
  const toast = useToast();

  const [title, setTitle] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(String(ENVELOPE_LIMITS.expiryDaysDefault));
  const [values, setValues] = useState<Record<string, string>>({});
  const [signers, setSigners] = useState<SignerDraft[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'save' | 'send' | 'preview' | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  // Reseeded whenever the server hands back a different envelope (creation, or a reload
  // after send). Keyed on the id rather than the object so a re-render of the same
  // envelope never throws away what the admin is typing.
  useEffect(() => {
    if (!detail) return;
    setTitle(detail.title);
    setExpiresInDays(String(detail.expiresInDays ?? ENVELOPE_LIMITS.expiryDaysDefault));
    setValues(
      Object.fromEntries(detail.fields.map((field) => [field.key, field.value ?? ''])),
    );
    setSigners(
      [...detail.signers]
        .sort((a, b) => a.order - b.order)
        .map((signer) => ({
          id: signer.id,
          roleKey: signer.roleKey,
          label: signer.label,
          name: signer.name ?? '',
          email: signer.email ?? '',
          order: signer.order,
        })),
    );
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id]);

  const senderFields = useMemo(
    () => (detail?.fields ?? []).filter((field) => field.filledBy === 'sender'),
    [detail],
  );
  const signerFields = useMemo(
    () => (detail?.fields ?? []).filter((field) => field.filledBy !== 'sender'),
    [detail],
  );

  const ordered = [...signers].sort((a, b) => a.order - b.order);
  const sameEmail =
    ordered.length === 2 &&
    ordered[0].email.trim().length > 0 &&
    ordered[0].email.trim().toLowerCase() === ordered[1].email.trim().toLowerCase();

  /* ---------------- validation ---------------- */

  /** Format and length only — what a draft has to satisfy before it can be stored. */
  function validateShape(): Record<string, string> {
    const next: Record<string, string> = {};

    const titleResult = validateEnvelopeTitle(title);
    if (!titleResult.valid) next.title = titleResult.error;

    const expiryResult = validateExpiryDays(expiresInDays);
    if (!expiryResult.valid) next.expiresInDays = expiryResult.error;

    for (const field of senderFields) {
      const raw = values[field.key] ?? '';
      if (raw.trim().length === 0) continue; // emptiness is only a send-time rule
      const message = validateFieldValue(field, raw);
      if (message) next[field.key] = message;
    }

    for (const signer of ordered) {
      if (signer.name.trim().length > 0) {
        const result = validateSignerName(signer.name);
        if (!result.valid) next[`signer-name-${signer.order}`] = result.error;
      }
      if (signer.email.trim().length > 0) {
        const result = validateSignerEmail(signer.email);
        if (!result.valid) next[`signer-email-${signer.order}`] = result.error;
      }
    }

    return next;
  }

  /** Everything the shape rule checks, plus the presence rules that only send enforces. */
  function validateForSend(): Record<string, string> {
    const next = validateShape();

    for (const field of senderFields) {
      if (!field.required) continue;
      if ((values[field.key] ?? '').trim().length === 0) {
        next[field.key] = ENVELOPE_MESSAGES.field.required(field.label);
      }
    }

    for (const signer of ordered) {
      const nameResult = validateSignerName(signer.name);
      if (!nameResult.valid) next[`signer-name-${signer.order}`] = nameResult.error;
      const emailResult = validateSignerEmail(signer.email);
      if (!emailResult.valid) next[`signer-email-${signer.order}`] = emailResult.error;
    }

    return next;
  }

  /** Test-id of the control the first error belongs to, in top-to-bottom order. */
  function firstErrorTestId(found: Record<string, string>): string | null {
    if (found.title) return 'envelope-title-input';
    if (found.expiresInDays) return 'envelope-expires-input';
    for (const field of senderFields) {
      if (found[field.key]) return `envelope-field-${field.key}`;
    }
    for (const signer of ordered) {
      if (found[`signer-name-${signer.order}`]) return `envelope-signer-name-${signer.order}`;
      if (found[`signer-email-${signer.order}`]) return `envelope-signer-email-${signer.order}`;
    }
    return null;
  }

  /* ---------------- requests ---------------- */

  function body() {
    const expiry = validateExpiryDays(expiresInDays);
    return {
      title: title.trim(),
      expiresInDays: expiry.valid ? expiry.value : ENVELOPE_LIMITS.expiryDaysDefault,
      fieldValues: Object.fromEntries(
        senderFields.map((field) => [field.key, values[field.key] ?? '']),
      ),
      signers: ordered.map((signer) => ({
        id: signer.id,
        name: signer.name.trim(),
        email: signer.email.trim().toLowerCase(),
        order: signer.order,
      })),
    };
  }

  /** Shared by "Save draft" and by the save that has to precede a send. */
  async function persist(): Promise<EnvelopeDetail | null> {
    if (!detail) return null;
    const result = await apiRequest<EnvelopeDetail>(envelopeUrl(orgId, detail.id), {
      method: 'PUT',
      body: JSON.stringify(body()),
    });
    if (result.ok) return result.data;

    if (result.failure.errors) {
      // The API keys signer errors as `signers[1].email`; the form keys them by order.
      const mapped: Record<string, string> = {};
      for (const [key, message] of Object.entries(result.failure.errors)) {
        const signerMatch = /^signers\[(\d+)\]\.(name|email)$/.exec(key);
        if (signerMatch) {
          const order = Number(signerMatch[1]) + 1;
          mapped[`signer-${signerMatch[2]}-${order}`] = message;
          continue;
        }
        mapped[key.replace(/^fieldValues\./, '')] = message;
      }
      setErrors(mapped);
      const target = firstErrorTestId(mapped);
      if (target) focusByTestId(target);
      return null;
    }

    toast.show({
      testId: 'toast-envelope-error',
      message: failureMessage(result.failure),
      tone: 'error',
    });
    return null;
  }

  async function saveDraft(): Promise<void> {
    if (busy) return;
    const found = validateShape();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const target = firstErrorTestId(found);
      if (target) focusByTestId(target);
      return;
    }

    setBusy('save');
    const saved = await persist();
    setBusy(null);
    if (!saved) return;
    onSaved(saved);
    toast.show({
      testId: 'toast-envelope-saved',
      message: ENVELOPE_MESSAGES.toast.draftSaved,
      tone: 'success',
    });
  }

  async function send(): Promise<void> {
    if (busy || !detail) return;
    const found = validateForSend();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const target = firstErrorTestId(found);
      if (target) focusByTestId(target);
      toast.show({
        testId: 'toast-envelope-error',
        message: ENVELOPE_MESSAGES.send.missingFields,
        tone: 'error',
      });
      return;
    }

    setBusy('send');
    // Send does not carry a body, so whatever is on screen has to be stored first —
    // otherwise the document that gets frozen is the last saved one, not the reviewed one.
    const saved = await persist();
    if (!saved) {
      setBusy(null);
      return;
    }

    const result = await apiRequest<SendEnvelopeResponse>(
      `${envelopeUrl(orgId, detail.id)}/send`,
      { method: 'POST', body: JSON.stringify({}) },
    );
    setBusy(null);

    if (result.ok) {
      onSent(result.data);
      return;
    }

    const failure = result.failure;
    if (failure.error === 'missing_required_fields' && failure.keys) {
      const mapped: Record<string, string> = {};
      for (const key of failure.keys) {
        const field = senderFields.find((candidate) => candidate.key === key);
        mapped[key] = ENVELOPE_MESSAGES.field.required(field?.label ?? key);
      }
      setErrors(mapped);
      const target = firstErrorTestId(mapped);
      if (target) focusByTestId(target);
      toast.show({
        testId: 'toast-envelope-error',
        message: ENVELOPE_MESSAGES.send.missingFields,
        tone: 'error',
      });
      return;
    }

    toast.show({
      testId: 'toast-envelope-error',
      message:
        failure.error === 'incomplete_signers'
          ? ENVELOPE_MESSAGES.send.incompleteSigners
          : failure.error === 'mail_delivery_failed'
            ? ENVELOPE_MESSAGES.send.mailFailure
            : failure.error === 'not_draft'
              ? ENVELOPE_MESSAGES.send.alreadySent
              : failureMessage(failure),
      tone: 'error',
    });
  }

  async function preview(): Promise<void> {
    if (busy || !detail) return;
    setBusy('preview');
    // The spec's preview shows the document "with real values", but the only documented
    // preview endpoint (spec 01) substitutes *synthetic* ones and knows nothing about an
    // envelope. This calls the envelope's own preview; if the API has not grown it yet the
    // failure surfaces as an error toast rather than as a silently wrong document.
    const result = await apiRequest<{ html: string }>(`${envelopeUrl(orgId, detail.id)}/preview`, {
      method: 'POST',
      body: JSON.stringify({ fieldValues: body().fieldValues }),
    });
    setBusy(null);
    if (!result.ok) {
      toast.show({
        testId: 'toast-envelope-error',
        message: failureMessage(result.failure),
        tone: 'error',
      });
      return;
    }
    setPreviewHtml(result.data.html);
  }

  /* ---------------- render ---------------- */

  const templateOptions = templates.map((template) => ({
    value: template.id,
    label: template.currentVersionNumber
      ? `${template.name} (v${template.currentVersionNumber})`
      : template.name,
  }));

  const subjectOptions = [
    { value: '', label: 'None' },
    ...members.map((member) => ({ value: member.id, label: member.name })),
  ];

  const locked = detail !== null;

  return (
    <form
      data-testid="envelope-fill-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-10)' }}
    >
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-7)' }}>
          <div>
            <Select
              label="Template *"
              value={templateId}
              options={templateOptions}
              placeholder="Select a published template"
              disabled={locked}
              onChange={onTemplateChange}
              data-testid="envelope-template-select"
            />
            {!locked && (
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: 'var(--fs-13)',
                  color: 'var(--text-muted)',
                }}
              >
                Choosing a template creates the document and pins its current version. The
                template and subject are fixed from then on.
              </p>
            )}
          </div>

          <Select
            label="Subject"
            value={subjectId}
            options={subjectOptions}
            placeholder="None"
            disabled={locked}
            onChange={onSubjectChange}
            data-testid="envelope-subject-select"
          />

          {creating && (
            <div style={{ display: 'flex', gap: 'var(--sp-4)', color: 'var(--accent)' }}>
              <Spinner size={18} />
              <span style={{ fontSize: 'var(--fs-14)', color: 'var(--text-muted)' }}>
                Creating the document…
              </span>
            </div>
          )}

          <Input
            label="Title"
            value={title}
            disabled={readOnly}
            readOnly={readOnly}
            data-testid="envelope-title-input"
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              const result = validateEnvelopeTitle(title);
              setErrors((prev) => ({ ...prev, title: result.valid ? '' : result.error }));
            }}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? 'field-error-title' : undefined}
            error={errors.title ? errorNode('title', errors.title) : undefined}
            wrapperStyle={{ gap: 0 }}
          />

          <Input
            label={`Expires in (days, ${ENVELOPE_LIMITS.expiryDaysMin}–${ENVELOPE_LIMITS.expiryDaysMax})`}
            type="number"
            value={expiresInDays}
            disabled={readOnly}
            readOnly={readOnly}
            data-testid="envelope-expires-input"
            onChange={(event) => setExpiresInDays(event.target.value)}
            onBlur={() => {
              const result = validateExpiryDays(expiresInDays);
              setErrors((prev) => ({ ...prev, expiresInDays: result.valid ? '' : result.error }));
            }}
            aria-invalid={errors.expiresInDays ? true : undefined}
            aria-describedby={errors.expiresInDays ? 'field-error-expiresInDays' : undefined}
            error={
              errors.expiresInDays
                ? errorNode('expiresInDays', errors.expiresInDays)
                : undefined
            }
            wrapperStyle={{ gap: 0, maxWidth: 260 }}
          />
        </div>
      </Card>

      {detail && (
        <Card title="Fields you fill">
          {senderFields.length === 0 && (
            <p style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--text-muted)' }}>
              This template has no fields for you to fill.
            </p>
          )}
          <div style={{ display: 'grid', gap: 'var(--sp-7)' }}>
            {senderFields.map((field) => (
              <div key={field.key}>
                <FieldInput
                  field={field}
                  value={values[field.key] ?? ''}
                  disabled={readOnly}
                  testId={`envelope-field-${field.key}`}
                  error={errors[field.key] || undefined}
                  onChange={(next) =>
                    setValues((prev) => ({ ...prev, [field.key]: next }))
                  }
                  onBlur={() => {
                    const message = validateFieldValue(field, values[field.key] ?? '');
                    setErrors((prev) => ({ ...prev, [field.key]: message ?? '' }));
                  }}
                />
                {field.autofilled && <AutofillHint field={field} />}
              </div>
            ))}
          </div>
        </Card>
      )}

      {detail && signerFields.length > 0 && (
        <Card title="Fields the signers fill">
          <div data-testid="envelope-signer-fields-preview">
            {signerFields.map((field) => (
              <SignerFieldPreview
                key={field.key}
                field={field}
                ownerName={ownerLabel(field.filledBy, detail.signers)}
              />
            ))}
          </div>
        </Card>
      )}

      {detail && (
        <Card
          title="Signers"
          action={
            readOnly ? undefined : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="envelope-swap-order-btn"
                onClick={() =>
                  setSigners((prev) =>
                    prev.map((signer) => ({ ...signer, order: signer.order === 1 ? 2 : 1 })),
                  )
                }
              >
                Swap signing order
              </Button>
            )
          }
        >
          <div style={{ display: 'grid', gap: 'var(--sp-8)' }}>
            {ordered.map((signer) => (
              <div key={signer.id} data-testid={`envelope-signer-input-${signer.order}`}>
                <SectionLabel style={{ marginBottom: 8 }}>
                  {signer.order}. {signer.label || signer.roleKey}
                </SectionLabel>
                <div style={{ display: 'flex', gap: 'var(--sp-6)', flexWrap: 'wrap' }}>
                  <Input
                    label="Name"
                    value={signer.name}
                    disabled={readOnly}
                    readOnly={readOnly}
                    data-testid={`envelope-signer-name-${signer.order}`}
                    onChange={(event) =>
                      setSigners((prev) =>
                        prev.map((row) =>
                          row.id === signer.id ? { ...row, name: event.target.value } : row,
                        ),
                      )
                    }
                    error={
                      errors[`signer-name-${signer.order}`]
                        ? errorNode(
                            `signer-name-${signer.order}`,
                            errors[`signer-name-${signer.order}`],
                          )
                        : undefined
                    }
                    wrapperStyle={{ gap: 0, flex: 1, minWidth: 200 }}
                  />
                  <Input
                    label="Email"
                    type="email"
                    value={signer.email}
                    disabled={readOnly}
                    readOnly={readOnly}
                    data-testid={`envelope-signer-email-${signer.order}`}
                    onChange={(event) =>
                      setSigners((prev) =>
                        prev.map((row) =>
                          row.id === signer.id ? { ...row, email: event.target.value } : row,
                        ),
                      )
                    }
                    error={
                      errors[`signer-email-${signer.order}`]
                        ? errorNode(
                            `signer-email-${signer.order}`,
                            errors[`signer-email-${signer.order}`],
                          )
                        : undefined
                    }
                    wrapperStyle={{ gap: 0, flex: 1, minWidth: 220 }}
                  />
                </div>
              </div>
            ))}

            {sameEmail && (
              // Requirement 9 — legal, and deliberately a warning rather than a block:
              // one person signing in two capacities is a real arrangement, and each
              // signer still gets their own token and their own turn.
              <InfoBanner tone="warning" data-testid="envelope-same-email-warning">
                Both signers use the same email address. Each still receives a separate link
                and must sign in turn.
              </InfoBanner>
            )}
          </div>
        </Card>
      )}

      {detail && !readOnly && (
        <div style={{ display: 'flex', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
          <Button
            type="button"
            variant="secondary"
            loading={busy === 'save'}
            data-testid="envelope-save-draft-btn"
            onClick={() => void saveDraft()}
          >
            Save draft
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={busy === 'preview'}
            data-testid="envelope-preview-btn"
            onClick={() => void preview()}
          >
            Preview
          </Button>
          {/* Never disabled for validation — clicking with an incomplete form is how the
              caller finds out what is missing (repository rule). */}
          <Button type="submit" variant="primary" loading={busy === 'send'} data-testid="envelope-send-btn">
            Send for signature
          </Button>
        </div>
      )}

      <PreviewModal
        open={previewHtml !== null}
        html={previewHtml ?? ''}
        onClose={() => setPreviewHtml(null)}
      />
    </form>
  );
}

/** Requirement 4 — an autofilled value is a starting point, so the hint never locks it. */
function AutofillHint({ field }: { field: EnvelopeFieldDto }) {
  return (
    <span
      data-testid={`envelope-field-autofill-${field.key}`}
      style={{
        display: 'inline-block',
        marginTop: 6,
        fontSize: 'var(--fs-12)',
        color: 'var(--text-muted)',
      }}
    >
      ⟲ from profile — edit freely
    </span>
  );
}
