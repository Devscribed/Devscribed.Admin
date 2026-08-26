'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  CRITERION_LIMITS,
  CRITERION_MESSAGES,
  CRITERION_TYPES,
  CRITERION_TYPE_LABELS,
  MESSAGES,
  moveValue,
  scaleWasReordered,
  valueInUseMessage,
  type CriterionType,
} from '@devscribed/validation';
import { Badge, Button, IconButton, Input, Modal, Tooltip } from '@/ds';
import type { Criterion } from '@/hiring/types';

/** One row of the scale editor. `key` is stable across a reorder; `id` exists once saved. */
interface ValueRow {
  key: string;
  id?: string;
  label: string;
  /** Non-zero disables the remove control — a value in use may not go (06 §03.16). */
  assessmentCount: number;
}

const rowsOf = (criterion?: Criterion): ValueRow[] =>
  (criterion?.values ?? []).map((value) => ({
    key: value.id,
    id: value.id,
    label: value.label,
    assessmentCount: value.assessmentCount,
  }));

/**
 * Create or edit a criterion (hiring 06 §04, and the inline path of 04 §05.26).
 *
 * This is the one dialog that can open during a live interview, which is why it is
 * compact and why the values field takes keyboard entry throughout: type a label, press
 * Enter, repeat. A six-value scale is six keystrokes and six returns.
 *
 * It is also the single moment of friction in the whole design, and deliberately so.
 * Inferring a scale's order from the order values happened to be used in would leave
 * every filter quietly wrong until somebody noticed, so the order is asked for once,
 * visibly, with the direction stated in the label rather than implied by a drag handle.
 *
 * **Type is absent when editing**, not disabled: it is immutable, and a disabled control
 * invites the reader to wonder what they are missing (06 design §Interactions).
 */
export function CriterionDialog({
  orgId,
  open,
  criterion,
  initialName = '',
  onClose,
  onSaved,
}: {
  orgId: string;
  open: boolean;
  /** Absent creates; present edits. */
  criterion?: Criterion;
  /** What the member typed into the autocomplete that offered `Create "…"`. */
  initialName?: string;
  onClose: () => void;
  onSaved: (criterion: Criterion) => void;
}) {
  const editing = criterion !== undefined;

  const [name, setName] = useState('');
  const [type, setType] = useState<CriterionType>('scale');
  const [values, setValues] = useState<ValueRow[]>([]);
  const [draft, setDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [valuesError, setValuesError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const fresh = useRef(0);

  useEffect(() => {
    if (!open) return;
    setName(criterion?.name ?? initialName);
    setType(criterion?.type ?? 'scale');
    setValues(rowsOf(criterion));
    setDraft('');
    setNameError(null);
    setValuesError(null);
    setBanner(null);
    setConfirming(false);
  }, [open, criterion, initialName]);

  /** The ids as they were, so a reorder can be told apart from an addition. */
  const originalIds = (criterion?.values ?? []).map((value) => value.id);
  const reordered =
    editing &&
    scaleWasReordered(
      originalIds,
      values.map((row) => row.id).filter((id): id is string => id !== undefined),
    );

  function addValue(label: string): void {
    const trimmed = label.trim();
    if (trimmed.length === 0) return;
    if (values.length >= CRITERION_LIMITS.valuesMax) {
      setValuesError(CRITERION_MESSAGES.values.tooMany);
      return;
    }
    fresh.current += 1;
    setValues((prev) => [...prev, { key: `new-${fresh.current}`, label: trimmed, assessmentCount: 0 }]);
    setDraft('');
    setValuesError(null);
  }

  async function save(): Promise<void> {
    if (submitting) return;

    // The confirmation goes up before the request does, so cancelling leaves the saved
    // order untouched rather than undoing a write (06 design §States).
    if (reordered && !confirming) {
      setConfirming(true);
      return;
    }

    setSubmitting(true);
    setBanner(null);
    setNameError(null);
    setValuesError(null);

    try {
      const response = await fetch(
        `/api/organizations/${orgId}/hiring/criteria${editing ? `/${criterion.id}` : ''}`,
        {
          method: editing ? 'PATCH' : 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            // Absent on an edit: the type cannot move, and re-asserting it would make a
            // rename fail for a reason that has nothing to do with the rename.
            ...(editing ? {} : { type }),
            ...(type === 'scale'
              ? {
                  values: values.map((row) => ({
                    ...(row.id ? { id: row.id } : {}),
                    label: row.label,
                  })),
                }
              : {}),
          }),
        },
      );

      if (response.ok) {
        setConfirming(false);
        onSaved(await response.json());
        return;
      }

      const body = await response.json().catch(() => ({}));
      setConfirming(false);
      // Every message shown here is the server's own — the client never guesses at one.
      if (body.error === 'duplicate_name') setNameError(body.message);
      else if (body.error === 'validation') {
        setNameError(body.fields?.name ?? null);
        setValuesError(body.fields?.type ?? null);
        if (!body.fields?.name && !body.fields?.type) setBanner(MESSAGES.generic);
      } else if (typeof body.message === 'string') setValuesError(body.message);
      else setBanner(MESSAGES.generic);
    } catch {
      setConfirming(false);
      setBanner(MESSAGES.generic);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Modal
        open={open && !confirming}
        title={editing ? 'Edit criteria' : 'New criteria'}
        onClose={onClose}
        width={520}
        data-testid="criterion-dialog"
        actions={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={save}
              loading={submitting}
              data-testid="criterion-submit-button"
            >
              {editing ? 'Save' : 'Create'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 'var(--sp-10)' }}>
          {banner && (
            <div role="alert" style={{ fontSize: 'var(--fs-13)', color: 'var(--error-500)' }}>
              {banner}
            </div>
          )}

          <Input
            label="Name"
            placeholder="English"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              void save();
            }}
            error={nameError ?? undefined}
            aria-invalid={nameError ? true : undefined}
            data-testid="criterion-name-input"
          />

          {/*
            Native radios rather than the DS `RadioGroup`, which has no way to tag an
            option — the same decision the vacancy dialog's interview length made, and for
            the same reason.
          */}
          {!editing && (
            <fieldset style={{ margin: 0, padding: 0, border: 'none' }}>
              <legend style={MICRO_LABEL}>Type</legend>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-8)' }}>
                {CRITERION_TYPES.map((option) => (
                  <label
                    key={option}
                    data-testid={`criterion-type-${option}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', cursor: 'pointer' }}
                  >
                    <input
                      type="radio"
                      name="criterion-type"
                      value={option}
                      checked={type === option}
                      onChange={() => setType(option)}
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    <span style={{ fontSize: 'var(--fs-14)' }}>{CRITERION_TYPE_LABELS[option]}</span>
                  </label>
                ))}
              </div>
              {/* Why the choice matters, rather than a restatement of the four options. */}
              <p style={{ margin: 'var(--sp-4) 0 0', fontSize: 'var(--fs-12)', color: 'var(--text-muted)' }}>
                {CRITERION_MESSAGES.type.hint}
              </p>
            </fieldset>
          )}

          {/* Hidden entirely for the other three types, never disabled. */}
          {type === 'scale' && (
            <ScaleEditor
              values={values}
              draft={draft}
              error={valuesError}
              onDraft={setDraft}
              onAdd={addValue}
              onChange={setValues}
            />
          )}
        </div>
      </Modal>

      <Modal
        open={open && confirming}
        title="Reorder these values?"
        onClose={() => setConfirming(false)}
        data-testid="criterion-reorder-confirm"
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={save}
              loading={submitting}
              data-testid="criterion-reorder-confirm-button"
            >
              Save
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}>
          {/* The only edit in either library with retroactive effect, so it is the only
              one that confirms. Renaming a value does not — comparison reads positions. */}
          {CRITERION_MESSAGES.values.reorderConfirmation}
        </p>
      </Modal>
    </>
  );
}

/**
 * The scale, worst to best: draggable chips and a field that appends on Enter.
 *
 * Reordering is operable by pointer and by keyboard, and both drive the same list. The
 * keyboard path is not an afterthought here: this dialog opens mid-interview, and a
 * member who has both hands on the keyboard should not have to find a mouse to put `B1`
 * above `A2`.
 */
function ScaleEditor({
  values,
  draft,
  error,
  onDraft,
  onAdd,
  onChange,
}: {
  values: ValueRow[];
  draft: string;
  error: string | null;
  onDraft: (value: string) => void;
  onAdd: (label: string) => void;
  onChange: (values: ValueRow[]) => void;
}) {
  /** The chip a pointer is dragging, or the one the keyboard is holding. */
  const [dragging, setDragging] = useState<number | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  /** The order at pick-up, so Escape can put it back rather than merely letting go. */
  const beforePickUp = useRef<ValueRow[] | null>(null);

  const move = (from: number, to: number): void => {
    if (to < 0 || to >= values.length) return;
    onChange(moveValue(values, from, to));
  };

  function onHandleKeyDown(event: KeyboardEvent, index: number): void {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      const picking = held === null;
      beforePickUp.current = picking ? values : null;
      setHeld(picking ? index : null);
      setAnnouncement(
        picking
          ? `${values[index].label} picked up, position ${index + 1} of ${values.length}`
          : `${values[index].label} dropped at position ${index + 1} of ${values.length}`,
      );
      return;
    }
    if (held === null) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      // Put it back: a cancel that only let go would leave the value wherever the last
      // arrow key happened to land it, which is not what cancelling means.
      if (beforePickUp.current) onChange(beforePickUp.current);
      beforePickUp.current = null;
      setHeld(null);
      setAnnouncement('Reorder cancelled');
      return;
    }

    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (step === 0) return;
    event.preventDefault();

    const to = index + step;
    if (to < 0 || to >= values.length) return;
    move(index, to);
    setHeld(to);
    setAnnouncement(`${values[index].label} moved to position ${to + 1} of ${values.length}`);
    // The handle travels with the chip, so focus follows it rather than being left on
    // whatever slid into its place.
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>(`[data-testid="criterion-value-handle-${to}"]`)?.focus(),
    );
  }

  return (
    <div>
      <span style={MICRO_LABEL} id="criterion-values-label">
        {CRITERION_MESSAGES.values.label}
      </span>

      {/* An ordered list, so the order is conveyed structurally and not only visually. */}
      <ol
        aria-labelledby="criterion-values-label"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--sp-3)',
          listStyle: 'none',
          margin: '0 0 var(--sp-6)',
          padding: 0,
        }}
      >
        {values.map((value, index) => (
          <li
            key={value.key}
            draggable
            onDragStart={() => setDragging(index)}
            onDragEnd={() => setDragging(null)}
            onDragOver={(event) => event.preventDefault()}
            onDragEnter={() => {
              if (dragging === null || dragging === index) return;
              move(dragging, index);
              setDragging(index);
            }}
            data-testid={`criterion-value-input-${index}`}
            style={{
              display: 'inline-flex',
              borderRadius: 'var(--radius-pill)',
              boxShadow: dragging === index || held === index ? 'var(--shadow-pop)' : 'none',
              outline: held === index ? '1.5px solid var(--accent)' : 'none',
              transition: 'box-shadow var(--duration-base)',
            }}
          >
            <Badge tone="neutral" dot={false} style={{ paddingLeft: 4, paddingRight: 4, gap: 2 }}>
              <button
                type="button"
                aria-label={`Reorder ${value.label}, position ${index + 1} of ${values.length}`}
                aria-pressed={held === index}
                aria-describedby="criterion-values-hint"
                onKeyDown={(event) => onHandleKeyDown(event, index)}
                data-testid={`criterion-value-handle-${index}`}
                style={{
                  border: 'none',
                  background: 'none',
                  padding: '0 2px',
                  cursor: 'grab',
                  color: 'var(--text-muted)',
                  fontSize: 'var(--fs-12)',
                  lineHeight: 1,
                }}
              >
                <span aria-hidden="true">⠿</span>
              </button>
              {value.label}
              <ValueRemove
                value={value}
                index={index}
                onRemove={() => onChange(values.filter((_, i) => i !== index))}
              />
            </Badge>
          </li>
        ))}
      </ol>

      <Input
        placeholder={CRITERION_MESSAGES.values.addPlaceholder}
        aria-label="Add value"
        value={draft}
        onChange={(event) => onDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          // Enter belongs to this field while it holds text: six values are six returns.
          event.preventDefault();
          onAdd(draft);
        }}
        onBlur={() => onAdd(draft)}
        error={error ?? undefined}
        data-testid="criterion-value-add"
      />

      <p
        id="criterion-values-hint"
        style={{ margin: 'var(--sp-4) 0 0', fontSize: 'var(--fs-12)', color: 'var(--text-muted)' }}
      >
        Press Space on a handle to pick a value up, arrows to move it, Space to drop,
        Escape to cancel.
      </p>

      <span aria-live="polite" style={VISUALLY_HIDDEN}>
        {announcement}
      </span>
    </div>
  );
}

/**
 * A value's remove control, disabled once anything has been assessed against it.
 *
 * Disabled rather than hidden, and still focusable, so the reason is reachable: a missing
 * control is indistinguishable from a bug (06 design §Accessibility).
 */
function ValueRemove({
  value,
  index,
  onRemove,
}: {
  value: ValueRow;
  index: number;
  onRemove: () => void;
}) {
  const blocked = value.assessmentCount > 0;
  const reason = blocked ? valueInUseMessage(value.label, value.assessmentCount) : undefined;

  return (
    <Tooltip content={reason}>
      {(tooltipId: string) => (
        <IconButton
          label={blocked ? `${reason}` : `Remove ${value.label}`}
          size={20}
          aria-describedby={blocked ? tooltipId : undefined}
          aria-disabled={blocked || undefined}
          onClick={() => {
            if (blocked) return;
            onRemove();
          }}
          data-testid={`criterion-value-remove-${index}`}
        >
          <span aria-hidden="true" style={{ fontSize: 'var(--fs-12)', lineHeight: 1 }}>
            ×
          </span>
        </IconButton>
      )}
    </Tooltip>
  );
}

const MICRO_LABEL = {
  display: 'block',
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--fs-11)',
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: 6,
} as const;

/** Present to a screen reader, absent to everything else. */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
} as const;
