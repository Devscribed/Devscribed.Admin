import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Badge } from '../feedback/Badge.jsx';
import { IconButton } from '../actions/IconButton.jsx';

const Cross = () => (
  <svg viewBox="0 0 10 10" width={8} height={8} aria-hidden>
    <path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

/** Case- and whitespace-insensitive, which is how every filter here compares a name. */
const fold = (value) => String(value ?? '').trim().toLowerCase();

/**
 * Multi-select text picker with an optional create-what-you-typed row.
 *
 * `Select` takes a fixed list and offers no typing, no filtering, no multi-select and no
 * way to add an entry — so a field backed by a library the member also maintains needs
 * this instead. Selection is a list of values whatever `multiple` says; a single-select
 * combobox is the same control with a list of at most one.
 *
 * Filtering folds case deliberately: an option that already exists must never be hidden
 * behind a `Create "…"` row for a difference in capitalisation, because creating it is
 * exactly what the caller's library will refuse.
 */
export function Combobox({
  label,
  value = [],
  options = [],
  onChange,
  onCreate,
  allowCreate = false,
  multiple = true,
  placeholder = 'Type to add…',
  error,
  disabled,
  createLabel = 'Create',
  emptyLabel = 'No matches',
  /** `data-testid` for the `Create "…"` row, which has no id of its own to key off. */
  createTestId,
  chipTestId,
  optionTestId,
  wrapperStyle,
  ...rest
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listId = `${useId()}-listbox`;

  useEffect(() => {
    if (!open) return;
    const away = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const selected = value.map((v) => byValue.get(v) ?? { value: v, label: v });

  const matches = useMemo(() => {
    const needle = fold(query);
    return options.filter(
      (option) =>
        !value.includes(option.value) &&
        (needle.length === 0 || fold(option.label).includes(needle)),
    );
  }, [options, value, query]);

  // The create row appears only when nothing matches the typed name exactly — a
  // case variant of an existing entry is an existing entry (06 §01.3).
  const typed = query.trim();
  const exists =
    typed.length > 0 &&
    options.some((option) => fold(option.label) === fold(typed));
  const offersCreate = allowCreate && typed.length > 0 && !exists;

  const rows = offersCreate ? [...matches, { create: true }] : matches;
  const activeRow = rows[Math.min(active, rows.length - 1)];

  function commit(row) {
    if (!row) return;
    if (row.create) onCreate && onCreate(typed);
    else onChange && onChange(multiple ? [...value, row.value] : [row.value]);
    setQuery('');
    setActive(0);
    // Kept open: adding three categories in a row should not need three clicks back in.
    setOpen(multiple);
  }

  function removeAt(index) {
    onChange && onChange(value.filter((_, i) => i !== index));
    inputRef.current && inputRef.current.focus();
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (rows.length ? (current + step + rows.length) % rows.length : 0));
      return;
    }
    if (event.key === 'Enter') {
      if (!open || !activeRow) return;
      // Only when the list has something to commit — otherwise Enter belongs to the
      // form this control sits in.
      event.preventDefault();
      commit(activeRow);
      return;
    }
    if (event.key === 'Escape') {
      if (!open) return;
      event.preventDefault();
      setOpen(false);
      return;
    }
    // Backspace at the start of an empty input removes the last chip — the standard
    // token-field gesture, and the only way to clear one without reaching for a mouse.
    if (event.key === 'Backspace' && query.length === 0 && value.length > 0) {
      event.preventDefault();
      removeAt(value.length - 1);
    }
  }

  const borderColor = error
    ? 'var(--error-500)'
    : open
      ? 'var(--accent)'
      : 'var(--border-strong)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', ...wrapperStyle }}>
      {label && (
        <label
          htmlFor={rest.id}
          style={{
            display: 'block',
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--fs-11)',
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: error ? 'var(--error-500)' : 'var(--text-muted)',
            marginBottom: 6,
          }}
        >
          {label}
        </label>
      )}

      <div ref={rootRef} style={{ position: 'relative' }}>
        <div
          onClick={() => !disabled && inputRef.current && inputRef.current.focus()}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 'var(--sp-2)',
            minHeight: 'var(--field-h-lg)',
            padding: '5px 10px',
            border: `1.5px solid ${borderColor}`,
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-field)',
            boxShadow: open
              ? error
                ? 'var(--shadow-glow-error)'
                : 'var(--shadow-glow-accent)'
              : 'none',
            transition: 'border-color .15s, box-shadow .15s',
            cursor: disabled ? 'not-allowed' : 'text',
            opacity: disabled ? 0.55 : 1,
          }}
        >
          {/* A list, so the chips are countable and navigable rather than loose text. */}
          {selected.length > 0 && (
            <ul
              style={{
                display: 'contents',
                margin: 0,
                padding: 0,
                listStyle: 'none',
              }}
            >
              {selected.map((option, index) => (
                <li key={option.value} style={{ display: 'inline-flex' }}>
                  <Badge
                    tone="neutral"
                    dot={false}
                    data-testid={chipTestId && chipTestId(option.value)}
                    style={{ paddingRight: 4, gap: 2 }}
                  >
                    {option.label}
                    <IconButton
                      // Named with the entry, never a bare "Remove" repeated down a row.
                      label={`Remove ${option.label}`}
                      size={20}
                      disabled={disabled}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeAt(index);
                      }}
                    >
                      <Cross />
                    </IconButton>
                  </Badge>
                </li>
              ))}
            </ul>
          )}

          <input
            {...rest}
            ref={inputRef}
            role="combobox"
            type="text"
            autoComplete="off"
            disabled={disabled}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && activeRow
                ? activeRow.create
                  ? `${listId}-create`
                  : `${listId}-${activeRow.value}`
                : undefined
            }
            value={query}
            placeholder={selected.length === 0 ? placeholder : ''}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            style={{
              flex: 1,
              minWidth: 80,
              height: 30,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontFamily: 'var(--font-text)',
              fontSize: 'var(--fs-15)',
              color: 'var(--text)',
            }}
          />
        </div>

        {open && (
          <div
            id={listId}
            role="listbox"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '100%',
              marginTop: 6,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-pop)',
              zIndex: 30,
              overflowY: 'auto',
              overflowX: 'hidden',
              maxHeight: 260,
              overscrollBehavior: 'contain',
            }}
          >
            {rows.length === 0 && (
              <div
                style={{
                  padding: '10px 14px',
                  fontFamily: 'var(--font-text)',
                  fontSize: 'var(--fs-14)',
                  color: 'var(--text-muted)',
                }}
              >
                {emptyLabel}
              </div>
            )}

            {rows.map((row, index) => {
              const isActive = row === activeRow;
              const create = !!row.create;
              return (
                <div
                  key={create ? '__create' : row.value}
                  id={create ? `${listId}-create` : `${listId}-${row.value}`}
                  role="option"
                  aria-selected={isActive}
                  data-testid={
                    create ? createTestId : optionTestId && optionTestId(row.value)
                  }
                  onMouseEnter={() => setActive(index)}
                  // `mousedown` rather than `click`: the input must not blur and close
                  // the list out from under the pointer before the row is committed.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    commit(row);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 14px',
                    fontFamily: 'var(--font-text)',
                    fontSize: 'var(--fs-14)',
                    cursor: 'pointer',
                    color: create ? 'var(--accent)' : 'var(--text)',
                    background: isActive ? 'var(--hover-bg-tint)' : 'transparent',
                  }}
                >
                  {create ? `${createLabel} "${typed}"` : row.label}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <div
          style={{
            fontFamily: 'var(--font-text)',
            fontSize: 'var(--fs-12)',
            color: 'var(--error-500)',
            marginTop: 5,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
