'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ENVELOPE_LIMITS,
  ENVELOPE_MESSAGES,
  PROFILE_MESSAGES,
  findAutofillSource,
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
  type AutofillGap,
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
  /**
   * Requirement 13 — a removed member may still legitimately be the subject of a
   * contract, so they are listed, marked, and never the default.
   */
  isRemoved?: boolean;
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
  autofilled,
  autofillGaps,
  autofillTruncated,
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
  /**
   * The three autofill reports from `POST .../envelopes` (requirements 10-11). They only
   * exist on the screen that created the envelope; the detail screen renders the same
   * form without them and falls back to each field's own `autofilled` flag.
   */
  autofilled?: string[];
  autofillGaps?: AutofillGap[];
  autofillTruncated?: string[];
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

  /**
   * A key counts as autofilled if either source says so: the create response's list
   * (requirement 11) or the field's own flag on a reloaded envelope. Marking survives an
   * overwrite by design — TC-03-INT-05 keeps the key in `autofilled` after the sender
   * edits the value, because the marker records where the value *came from*.
   */
  const autofilledKeys = useMemo(() => {
    const keys = new Set(autofilled ?? []);
    for (const field of detail?.fields ?? []) if (field.autofilled) keys.add(field.key);
    return keys;
  }, [autofilled, detail]);

  /**
   * Same two-source rule as `autofilledKeys`: the create response reports truncation for
   * the envelope just made, and a reloaded envelope carries the flag on the field itself.
   * Requirement 10's whole point is that the sender *sees* the shortening, and a reload
   * must not be what makes the warning disappear.
   */
  const truncatedKeys = useMemo(() => {
    const keys = new Set(autofillTruncated ?? []);
    for (const field of detail?.fields ?? []) if (field.autofillTruncated) keys.add(field.key);
    return keys;
  }, [autofillTruncated, detail]);

  /**
   * Alt Flow "Manager creates a contract for a member whose PII they cannot read": the
   * value is real server-side and renders into the sent document, but this caller may not
   * read it. Such a field is read-only here, is never validated against a mask, and is
   * dropped from the `PUT` body — writing a mask back would corrupt the contract.
   */
  const maskedKeys = useMemo(
    () => new Set((detail?.fields ?? []).filter((field) => field.masked).map((f) => f.key)),
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
      if (maskedKeys.has(field.key)) continue; // not this caller's value to judge
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
      if (maskedKeys.has(field.key)) continue; // already filled server-side
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
        senderFields
          .filter((field) => !maskedKeys.has(field.key))
          .map((field) => [field.key, values[field.key] ?? '']),
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

  /**
   * Active members first, former ones after and suffixed. Meridian's `Select` has no
   * `optgroup` and no disabled option, so the spec's "Former members" group is expressed
   * as ordering plus a suffix rather than as a fake, unselectable header row — a header
   * that could be clicked would be a dead control. "None" stays the default, which is
   * what requirement 13's "not offered by default" asks for.
   */
  const subjectOptions = [
    { value: '', label: 'None' },
    ...members
      .filter((member) => !member.isRemoved)
      .map((member) => ({ value: member.id, label: member.name })),
    ...members
      .filter((member) => member.isRemoved)
      .map((member) => ({ value: member.id, label: `${member.name} — former member` })),
  ];

  const subject = members.find((member) => member.id === subjectId) ?? null;
  const totalFields = detail?.fields.length ?? 0;

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

          <div>
            <Select
              label="Subject"
              value={subjectId}
              options={subjectOptions}
              placeholder="None"
              disabled={locked}
              onChange={onSubjectChange}
              data-testid="envelope-subject-select"
            />
            {/* Requirement 12 — creating without a subject is a deliberate choice, and the
                order matters because autofill runs at creation, which the template pick
                triggers. Saying so here beats a form that quietly fills nothing. */}
            {!locked && (
              <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-13)', color: 'var(--text-muted)' }}>
                The member this contract is about. Pick them before the template — autofill
                runs when the document is created. Leaving this as None is fine.
              </p>
            )}
            {/* States table: "Subject removed — selecting one shows an advisory note,
                not an error." Resolution works exactly the same for them. */}
            {subject?.isRemoved && (
              <div style={{ marginTop: 'var(--sp-5)' }}>
                <InfoBanner tone="warning" data-testid="envelope-subject-removed-note">
                  {subject.name} is a former member. Their details still fill this contract.
                </InfoBanner>
              </div>
            )}
            {/* Requirement 11 — how much of the document the subject actually filled.
                Absent with no subject, which the States table asks for explicitly. */}
            {detail && subjectId.length > 0 && (
              <p
                data-testid="envelope-autofill-summary"
                style={{ margin: '8px 0 0', fontSize: 'var(--fs-13)', color: 'var(--text-sub)' }}
              >
                Fills {autofilledKeys.size} of {totalFields} fields from this member's profile
              </p>
            )}
          </div>

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
            {senderFields.map((field) => {
              const masked = maskedKeys.has(field.key);
              return (
                <div key={field.key}>
                  <FieldInput
                    field={field}
                    value={values[field.key] ?? ''}
                    disabled={readOnly || masked}
                    testId={`envelope-field-${field.key}`}
                    error={errors[field.key] || undefined}
                    onChange={(next) => setValues((prev) => ({ ...prev, [field.key]: next }))}
                    onBlur={() => {
                      const message = validateFieldValue(field, values[field.key] ?? '');
                      setErrors((prev) => ({ ...prev, [field.key]: message ?? '' }));
                    }}
                  />
                  {masked ? (
                    <span
                      data-testid={`envelope-field-masked-${field.key}`}
                      style={{
                        display: 'inline-block',
                        marginTop: 6,
                        fontSize: 'var(--fs-12)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Hidden — will be filled automatically
                    </span>
                  ) : (
                    autofilledKeys.has(field.key) && <AutofillMarker field={field} />
                  )}
                  {truncatedKeys.has(field.key) && (
                    <span
                      data-testid={`envelope-autofill-truncated-${field.key}`}
                      style={{
                        display: 'inline-block',
                        marginTop: 6,
                        fontSize: 'var(--fs-12)',
                        color: 'var(--amber-700)',
                      }}
                    >
                      {PROFILE_MESSAGES.autofill.truncated}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Alt Flow "Incomplete profile": gaps, never an error. The link opens in a new
              tab so the half-filled draft on this screen is not lost. */}
          {detail && subjectId.length > 0 && (autofillGaps?.length ?? 0) > 0 && (
            <div style={{ marginTop: 'var(--sp-7)' }}>
              <InfoBanner tone="warning" data-testid="envelope-autofill-gaps">
                <span>
                  {PROFILE_MESSAGES.autofill.gaps(
                    autofillGaps!.length,
                    joinLabels(autofillGaps!),
                  )}{' '}
                  <a
                    data-testid="envelope-open-profile-link"
                    href={`/org/${orgId}/members/${subjectId}?tab=contract-details`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--accent)', textDecoration: 'underline' }}
                  >
                    Open profile
                  </a>
                </span>
              </InfoBanner>
            </div>
          )}
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

/**
 * Spec 02 requirement 4 — an autofilled value is a starting point, not a lock, so this is
 * a marker beside an ordinary editable input rather than anything that disables it.
 *
 * The tooltip names the source when the API sends `autofillSource`; the catalogue lookup
 * is the package's, so the wording matches the picker the admin bound the field in.
 */
function AutofillMarker({ field }: { field: EnvelopeFieldDto }) {
  const source = field.autofillSource ? findAutofillSource(field.autofillSource) : undefined;
  const name = source?.label ?? null;
  return (
    <span
      data-testid={`envelope-field-autofill-${field.key}`}
      title={
        name
          ? `Filled automatically from ${name}. Edit it freely — the document keeps what you send.`
          : "Filled automatically from this member's profile. Edit it freely."
      }
      style={{
        display: 'inline-block',
        marginTop: 6,
        fontSize: 'var(--fs-12)',
        color: 'var(--text-muted)',
      }}
    >
      ⟲ {name ? `from ${name}` : 'from profile'} — edit freely
    </span>
  );
}

/**
 * "Bank details or ID document" — the gap banner's list of what the profile lacks.
 *
 * The labels are printed verbatim rather than lower-cased: they are field labels an
 * admin wrote, and "ID document" is not improved by becoming "id document".
 */
function joinLabels(gaps: AutofillGap[]): string {
  const labels = gaps.map((gap) => gap.label);
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
}
