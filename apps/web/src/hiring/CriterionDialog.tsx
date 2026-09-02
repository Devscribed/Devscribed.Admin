'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  CRITERION_LIMITS,
  CRITERION_MESSAGES,
  CRITERION_TYPES,
  CRITERION_TYPE_LABELS,
  MESSAGES,
  libraryNameKey,
  moveValue,
  scaleWasReordered,
  valueInUseMessage,
  type CriterionType,
} from '@devscribed/validation';
import {
  Button,
  Chip,
  ConfirmDialog,
  FieldLabel,
  FormActions,
  InfoBanner,
  Modal,
  TextInput,
} from '@devscribed/ds';
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
    /*
     * Refused here rather than on save. `validateCriterionValues` has always rejected a
     * repeated label — case-insensitively, on `libraryNameKey`, which is why that key is
     * reused rather than a local `toLowerCase` — but only the server ever ran it, so the
     * duplicate joined the chip list and the scale came back rejected a click later with
     * the error pointing at a field the offending value was no longer in. Its sibling
     * `tooMany` was already checked at this point; only this one was missed.
     *
     * The draft survives the refusal, because the fix is to edit what was typed.
     */
    const key = libraryNameKey(trimmed);
    if (values.some((row) => libraryNameKey(row.label) === key)) {
      setValuesError(CRITERION_MESSAGES.values.duplicate);
      return;
    }
    fresh.current += 1;
    setValues((prev) => [...prev, { key: `new-${fresh.current}`, label: trimmed, assessmentCount: 0 }]);
    setDraft('');
    setValuesError(null);
  }

  /**
   * `confirmed` is passed rather than read off state: the confirmation calls this from its
   * own accept handler, and whether it has been answered is that handler's fact, not a
   * render's.
   */
  async function save(confirmed = false): Promise<void> {
    if (submitting) return;

    // The confirmation goes up before the request does, so cancelling leaves the saved
    // order untouched rather than undoing a write (06 design §States).
    if (reordered && !confirmed) {
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
        data-testid="criterion-dialog"
        style={{ width: 520 }}
      >
        {/* 20px is the system's form rhythm and the room every field's message slot needs — the
            error is pinned under the control rather than pushing it. */}
        <div style={{ display: 'grid', gap: 'var(--space-7)' }}>
          {banner && (
            <InfoBanner variant="error" role="alert" aria-live="polite" data-testid="criterion-dialog-error">
              {banner}
            </InfoBanner>
          )}

          <TextInput
            label="Name"
            id="criterion-name-input"
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
            errorId="criterion-name-error"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? 'criterion-name-error' : undefined}
            data-testid="criterion-name-input"
          />

          {/*
            Native radios rather than a design-system control, which the system does not have —
            the same shape the vacancy dialog's interview length takes, down to `FieldLabel`
            being the system's own label so this row matches the fields above it exactly.
          */}
          {!editing && (
            <div role="radiogroup" aria-labelledby="criterion-type-label">
              <FieldLabel>
                <span id="criterion-type-label">Type</span>
              </FieldLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-6)' }}>
                {CRITERION_TYPES.map((option) => (
                  <label
                    key={option}
                    data-testid={`criterion-type-${option}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}
                  >
                    <input
                      type="radio"
                      name="criterion-type"
                      value={option}
                      checked={type === option}
                      onChange={() => setType(option)}
                      style={{ accentColor: 'var(--action-primary)' }}
                    />
                    <span style={{ fontSize: 'var(--font-size-s)' }}>{CRITERION_TYPE_LABELS[option]}</span>
                  </label>
                ))}
              </div>
              {/* Why the choice matters, rather than a restatement of the four options. */}
              <p style={{ margin: '5px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                {CRITERION_MESSAGES.type.hint}
              </p>
            </div>
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

          <FormActions align="full">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => void save()}
              preloader={submitting}
              data-testid="criterion-submit-button"
            >
              {editing ? 'Save' : 'Create'}
            </Button>
          </FormActions>
        </div>
      </Modal>

      {/*
        The only edit in either library with retroactive effect, so it is the only one that
        confirms — and it is a confirmation rather than a second form, which is the system's
        `ConfirmDialog` rather than another `Modal`. Renaming a value opens nothing:
        comparison reads positions, never labels.

        `closeOnAccept={false}` (§41) because accepting starts a request that can come back
        with a duplicate name on the field behind this dialog. Blue dismisses on accept, since
        there is no result to show yet; dismissing here would flash the edit dialog back up
        mid-flight and then take it away again.
      */}
      <ConfirmDialog
        open={open && confirming}
        title="Reorder these values?"
        description={CRITERION_MESSAGES.values.reorderConfirmation}
        acceptBtnText="Save"
        declineBtnText="Cancel"
        busy={submitting}
        closeOnAccept={false}
        onAccept={() => void save(true)}
        onClose={() => setConfirming(false)}
        acceptTestId="criterion-reorder-confirm-button"
        data-testid="criterion-reorder-confirm"
      />
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
      // arrow key happened to land it, which is not what cancelling means. The
      // `preventDefault` above is also what stops `Modal` closing underneath — a dialog
      // only takes `Escape` that nothing inside it has claimed (§8's note).
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

  const inUse = values
    .map((value, index) => ({ value, index }))
    .filter((entry) => entry.value.assessmentCount > 0);

  return (
    <div>
      <FieldLabel>
        <span id="criterion-values-label">{CRITERION_MESSAGES.values.label}</span>
      </FieldLabel>

      {/* An ordered list, so the order is conveyed structurally and not only visually. */}
      <ol
        aria-labelledby="criterion-values-label"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-1)',
          listStyle: 'none',
          margin: '0 0 var(--space-2)',
          padding: 0,
        }}
      >
        {values.map((value, index) => {
          const blocked = value.assessmentCount > 0;
          return (
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
                borderRadius: 'var(--radius-l)',
                boxShadow: dragging === index || held === index ? 'var(--shadow-popover)' : 'none',
                outline: held === index ? '1.5px solid var(--action-primary)' : 'none',
                transition: 'box-shadow var(--duration-fast)',
              }}
            >
              {/*
                `Chip`, not a composed `Badge` — the call Phase 5 settled on the candidate
                card and this spec's DS-gaps table used to make the other way. The handle is
                the `leading` slot (§39): putting it in `trailing` would sit a control that
                picks the value up next to one that deletes it.
              */}
              <Chip
                label={value.label}
                style={{ margin: 0, minWidth: 0 }}
                leading={
                  <button
                    type="button"
                    aria-label={`Reorder ${value.label}, position ${index + 1} of ${values.length}`}
                    aria-pressed={held === index}
                    aria-describedby="criterion-values-hint"
                    onKeyDown={(event) => onHandleKeyDown(event, index)}
                    data-testid={`criterion-value-handle-${index}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 2px',
                      background: 'none',
                      cursor: 'grab',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <GripIcon />
                  </button>
                }
                onRemove={() => onChange(values.filter((_, i) => i !== index))}
                removeLabel={`Remove ${value.label}`}
                removeTestId={`criterion-value-remove-${index}`}
                // Blocked rather than gone, and the reason is drawn under the list rather
                // than made this cross's name — a name and a description saying the same
                // sentence is that sentence read twice (§39, and reversal 2).
                removeDisabled={blocked || undefined}
                removeDescribedBy={blocked ? `criterion-value-in-use-${index}` : undefined}
              />
            </li>
          );
        })}
      </ol>

      {/*
        Why a cross does nothing, in the one place this dialog has room for a sentence.
        The settings screen behind it can let the blocked control carry its own reason,
        because the count it interpolates is already drawn two lines below on the row; a
        chip in a wrapping list has no such neighbour, so the reason is drawn here.
      */}
      {inUse.length > 0 && (
        <ul
          data-testid="criterion-values-in-use"
          style={{
            listStyle: 'none',
            margin: '0 0 var(--space-2)',
            padding: 0,
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-secondary)',
          }}
        >
          {inUse.map(({ value, index }) => (
            <li key={value.key} id={`criterion-value-in-use-${index}`}>
              {valueInUseMessage(value.label, value.assessmentCount)}
            </li>
          ))}
        </ul>
      )}

      <TextInput
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

      {/*
        20px, not 5. `TextInput` pins its message *below* the field rather than pushing it, so
        anything following a field needs the 16px of clearance that slot occupies — 20px is the
        first step of the system's scale that gives it, which is the call the token map recorded for
        `--sp-7` and every other form in the app already makes with its `--space-7` row gap.
        At 5px the duplicate-value error landed on top of this sentence.
      */}
      <p
        id="criterion-values-hint"
        style={{
          margin: 'var(--space-7) 0 0',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-secondary)',
        }}
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
 * The grip, drawn rather than typed: the system's icons are geometric, filled and `currentColor`,
 * and it has no drag handle of its own because nothing else here is draggable.
 */
function GripIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <circle cx="4" cy="2.5" r="1" />
      <circle cx="8" cy="2.5" r="1" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="8" cy="6" r="1" />
      <circle cx="4" cy="9.5" r="1" />
      <circle cx="8" cy="9.5" r="1" />
    </svg>
  );
}

/** Present to a screen reader, absent to everything else. */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
} as const;
