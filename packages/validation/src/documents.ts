/**
 * Document-template validation, the placeholder language, and the HTML sanitizer —
 * specs/documents/01-document-templates.md.
 *
 * This module is shared verbatim by the Next.js editor and the NestJS API. The sanitizer
 * in particular is a security control, not a convenience: template bodies are
 * author-controlled HTML that is rendered on the public signing page, so what this file
 * decides to keep is what a stranger's browser will execute. It runs server-side on every
 * save and the sanitized output is what gets stored (FR-19), which is why it has to work
 * with no DOM and no dependencies — this package compiles to plain `dist/` consumed by a
 * browser bundle and by a Node service alike, and its only devDependencies are typescript
 * and vitest. Pulling in a DOM-based sanitizer would break both.
 */

import type { FieldResult } from './index';

/* ------------------------------------------------------------------ *
 * Types, limits, and messages
 * ------------------------------------------------------------------ */

export type TemplateFieldType =
  | 'text'
  | 'multiline'
  | 'number'
  | 'date'
  | 'email'
  | 'select'
  | 'checkbox';

/** Declaration order is the order the type dropdown renders in. */
export const TEMPLATE_FIELD_TYPES: readonly TemplateFieldType[] = [
  'text',
  'multiline',
  'number',
  'date',
  'email',
  'select',
  'checkbox',
];

export type TemplateStatus = 'draft' | 'published' | 'archived';

export const TEMPLATE_STATUSES: readonly TemplateStatus[] = ['draft', 'published', 'archived'];

export const TEMPLATE_LIMITS = {
  nameMax: 120,
  descriptionMax: 500,
  /** 1 MB, measured in bytes rather than characters — the limit protects storage and the
   *  PDF renderer, both of which care about bytes, not about UTF-16 code units. */
  bodyMaxBytes: 1048576,
  fieldKeyMax: 64,
  fieldLabelMax: 120,
  signerLabelMax: 60,
  selectOptionMax: 100,
  selectOptionsMin: 2,
} as const;

/**
 * Every string here is verbatim from the spec's "Error Messages" table so a message can
 * never drift between the client form, the API response, and the E2E assertions.
 * Parameterized rows are functions rather than templates-with-placeholders for the same
 * reason: there is exactly one place that knows how the sentence is assembled.
 */
export const TEMPLATE_MESSAGES = {
  name: {
    required: 'Template name is required',
    tooLong: 'Template name must be at most 120 characters',
    duplicate: 'A template with this name already exists',
  },
  description: {
    tooLong: 'Description must be at most 500 characters',
  },
  fieldKey: {
    required: 'Field key is required',
    invalid: 'Field key must be lowercase letters, digits and underscores',
    duplicate: 'Field key is already used in this template',
    reserved: 'This field key is reserved',
  },
  fieldLabel: {
    /** The spec gives one message for the whole 1–120 rule, so over-length reuses it. */
    required: 'Field label is required',
  },
  fieldType: {
    /** Validation rule 5; the table has no row for it because the control is a select. */
    required: 'Select a field type',
  },
  options: {
    tooFew: 'A select field needs at least two options',
  },
  signer: {
    unknownRole: (key: string) => `Unknown signer role: ${key}`,
    invalidCount: 'A template must define exactly two signer roles',
    duplicateKeys: 'Signer role keys must be different',
    /** Not in the table — derived from validation rule 8, which the table folds into the
     *  count row. Kept separate so the Signers tab can point at the offending control. */
    invalidLabel: 'Signer role label is required',
    invalidKey: 'Signer role keys must be lowercase letters, digits and underscores',
    invalidOrder: 'Signer role orders must be 1 and 2',
  },
  body: {
    tooLarge: 'Template body must be at most 1 MB',
    empty: 'Template body cannot be empty',
    malformedPlaceholder: (offset: number) => `Malformed placeholder at position ${offset}`,
    unknownPlaceholders: (keys: readonly string[]) =>
      `These placeholders are not defined as fields: ${keys.join(', ')}`,
    sanitizerRemoved: (elements: readonly string[]) =>
      `Some content was removed for security: ${elements.join(', ')}`,
    unusedFields: (n: number) => `${n} field(s) are never used in the body`,
  },
  publish: {
    nothingToPublish: 'There is nothing to publish',
  },
  toast: {
    created: 'Template created',
    saved: 'Draft saved',
    published: 'Template published',
    archived: 'Template archived',
    deleted: 'Template deleted',
  },
  generic: {
    stale: 'This template was changed by someone else. Reload to see the latest version.',
    deleteBlocked: (n: number) =>
      `This template has been used by ${n} documents and cannot be deleted. Archive it instead.`,
    archived: 'This template is archived and cannot be edited',
    forbidden: 'You do not have permission to manage templates',
    networkError: 'Something went wrong. Please try again.',
    emptyState: 'No templates yet. Create one to start sending documents for signature.',
  },
} as const;

/**
 * The renderer supplies these itself (FR-14). A field claiming one of them would be
 * silently shadowed at render time, so the save is rejected instead.
 */
export const RESERVED_FIELD_KEYS: readonly string[] = [
  'signature_company',
  'signature_counterparty',
  'signed_date',
  'document_id',
];

/** `null` means the type has no meaningful character budget (select, checkbox). */
export const DEFAULT_MAX_LENGTH: Record<TemplateFieldType, number | null> = {
  text: 200,
  multiline: 2000,
  number: 30,
  date: 10,
  email: 254,
  select: null,
  checkbox: null,
};

export function defaultMaxLength(type: TemplateFieldType): number | null {
  return DEFAULT_MAX_LENGTH[type] ?? null;
}

/**
 * An explicit `MaxLength` may lower but never raise the default (FR-28). Clamping rather
 * than rejecting keeps a stale client from blocking a save, and the stored value is
 * always one the renderer and the fill form can both honour.
 */
export function clampMaxLength(
  type: TemplateFieldType,
  requested: number | null | undefined,
): number | null {
  const ceiling = defaultMaxLength(type);
  if (ceiling === null) return null;
  if (requested === null || requested === undefined) return ceiling;
  if (!Number.isFinite(requested)) return ceiling;
  const value = Math.floor(requested);
  if (value < 1) return ceiling;
  return Math.min(value, ceiling);
}

/** snake_case, must start with a letter, 1–64 characters (FR-13). */
export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

/* ------------------------------------------------------------------ *
 * Placeholders
 * ------------------------------------------------------------------ */

export type PlaceholderParse =
  | { ok: true; keys: string[] }
  | { ok: false; offset: number; message: string };

const malformed = (offset: number): PlaceholderParse => ({
  ok: false,
  offset,
  message: TEMPLATE_MESSAGES.body.malformedPlaceholder(offset),
});

/**
 * Finds every `{{key}}` in the body.
 *
 * Hand-written rather than a single regex because a regex can only report "no match" —
 * it cannot tell an unclosed `{{` from an illegal key, and the spec requires the offset
 * of the *opening* brace so the editor can put the caret on the mistake (FR-17).
 * The language is deliberately tiny: no conditionals, no loops, no nesting, no filters.
 */
export function parsePlaceholders(html: string): PlaceholderParse {
  const source = html ?? '';
  const keys: string[] = [];
  const seen = new Set<string>();

  let i = 0;
  while (i < source.length) {
    const open = source.indexOf('{{', i);
    if (open === -1) break;

    const close = source.indexOf('}}', open + 2);
    if (close === -1) return malformed(open);

    const inner = source.slice(open + 2, close);
    // A second `{{` before the closing braces is nesting, which the language does not
    // support. Reported against the outer opener because that is what the author typed.
    if (inner.includes('{{')) return malformed(open);

    const key = inner.trim();
    if (!FIELD_KEY_PATTERN.test(key)) return malformed(open);

    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
    i = close + 2;
  }

  return { ok: true, keys };
}

/** Matches a well-formed placeholder, tolerating the whitespace FR-12 allows. */
const PLACEHOLDER_PATTERN = /\{\{\s*([a-z][a-z0-9_]{0,63})\s*\}\}/g;

/**
 * Escapes the five characters that can break out of text or an attribute value.
 * Applied to every substituted field value, which is why a field value can never
 * introduce markup no matter what a sender types (TC-01-UNIT-04).
 */
export function escapeHtml(value: string): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Replaces every placeholder with its HTML-escaped value. A key with no value becomes
 * the empty string rather than being left as `{{key}}`: a rendered contract must never
 * show template syntax to a counterparty.
 */
export function substitute(html: string, values: Record<string, string>): string {
  const source = html ?? '';
  return source.replace(PLACEHOLDER_PATTERN, (_match, key: string) => {
    const value = values?.[key];
    return value === undefined || value === null ? '' : escapeHtml(String(value));
  });
}

/* ------------------------------------------------------------------ *
 * Sanitizer
 * ------------------------------------------------------------------ */

export interface SanitizeResult {
  html: string;
  removedElements: string[];
}

/** FR-20. Everything outside this list is either unwrapped or stripped with its content. */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'h1', 'h2', 'h3', 'h4', 'strong', 'em', 'u', 's',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote', 'hr', 'span', 'div', 'a', 'img',
]);

/** Emitted self-closing so the output shape does not depend on the input shape. */
const VOID_TAGS = new Set(['br', 'hr', 'img']);

/**
 * Removed *together with their contents* (FR-21). Unwrapping these would be worse than
 * useless: `<script>alert(1)</script>` unwrapped leaves the script source as visible
 * text, and `<style>` contents would leak CSS into the document body.
 */
const CONTENT_STRIPPED_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea',
  'select', 'button', 'svg', 'math', 'link', 'meta', 'base', 'noscript',
]);

/** Content-stripped tags that have no closing tag, so there is no content to skip. */
const CONTENT_STRIPPED_VOID = new Set(['input', 'link', 'meta', 'base']);

/** FR-20's token allow-list for the `style` attribute. */
const ALLOWED_STYLE_PROPERTIES = new Set([
  'text-align',
  'font-weight',
  'font-style',
  'text-decoration',
  'width',
  'page-break-before',
  'page-break-after',
]);

/** External fetches are forbidden outright — they are both tracking pixels and SSRF. */
const DANGEROUS_STYLE_TOKENS = ['url(', 'expression(', 'javascript:', '@import'];

const ALLOWED_LINK_SCHEMES = ['http:', 'https:', 'mailto:'];

const ALLOWED_IMAGE_PREFIXES = [
  'data:image/png',
  'data:image/jpeg',
  'data:image/gif',
  'data:image/webp',
];

interface ParsedAttribute {
  name: string;
  value: string | null;
}

interface OpenTagToken {
  kind: 'open';
  name: string;
  attributes: ParsedAttribute[];
  selfClosing: boolean;
  end: number;
}

interface CloseTagToken {
  kind: 'close';
  name: string;
  end: number;
}

interface DropToken {
  kind: 'drop';
  end: number;
}

type Token = OpenTagToken | CloseTagToken | DropToken;

const isWhitespace = (ch: string) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';
const isNameStart = (ch: string) => /[a-zA-Z]/.test(ch);
const isNameChar = (ch: string) => /[a-zA-Z0-9:_-]/.test(ch);

/**
 * Decodes the entity forms an attacker uses to hide a scheme from a naive prefix check
 * (`&#106;avascript:`), and drops the C0 control characters browsers strip from URLs
 * before resolving them (`java&#9;script:`). Used only to *decide*; the value that gets
 * emitted is the original text, so nothing legitimate is rewritten.
 */
function canonicalizeUrl(raw: string): string {
  const decoded = raw
    .replace(/&#x([0-9a-fA-F]+);?/g, (_m, hex: string) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_m, dec: string) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&tab;/gi, '\t')
    .replace(/&newline;/gi, '\n')
    .replace(/&colon;/gi, ':')
    .replace(/&NewLine;/g, '\n');

  // Strip everything a browser ignores when parsing a URL: C0 controls, DEL, and spaces.
  let stripped = '';
  for (const ch of decoded) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f) continue;
    stripped += ch;
  }
  return stripped.toLowerCase();
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

function isSafeLinkHref(raw: string): boolean {
  const url = canonicalizeUrl(raw);
  if (url.length === 0) return false;
  if (ALLOWED_LINK_SCHEMES.some((scheme) => url.startsWith(scheme))) return true;
  // A value with no scheme at all (a relative or fragment link) cannot execute, but the
  // spec forbids external resources and there is no base to resolve against, so drop it.
  return false;
}

function isSafeImageSrc(raw: string): boolean {
  const url = canonicalizeUrl(raw);
  return ALLOWED_IMAGE_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/**
 * Attribute values are re-emitted double-quoted. `&` is deliberately *not* escaped: the
 * sanitizer must be idempotent (FR-19 stores its own output and re-sanitizes on the next
 * save), and escaping `&` would turn `&amp;` into `&amp;amp;` on every round trip.
 */
function escapeAttributeValue(value: string): string {
  return value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Keeps only declarations whose property is on the allow-list and whose value carries no
 * resource-fetching or script-evaluating token. Re-emitted in a canonical `prop: value`
 * form so a second pass produces byte-identical output.
 */
function filterStyle(raw: string): string | null {
  const kept: string[] = [];
  for (const declaration of raw.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator === -1) continue;

    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if (property.length === 0 || value.length === 0) continue;
    if (!ALLOWED_STYLE_PROPERTIES.has(property)) continue;

    // Whitespace is removed before the token check so `url ( … )` cannot slip past.
    const probe = value.toLowerCase().replace(/\s+/g, '');
    if (DANGEROUS_STYLE_TOKENS.some((token) => probe.includes(token))) continue;

    kept.push(`${property}: ${value}`);
  }
  return kept.length === 0 ? null : kept.join('; ');
}

/**
 * Decides which attributes survive on an allowed tag. Returns `null` when the element
 * itself must go — currently only an `<img>` whose source is not an inline image, which
 * cannot be repaired by dropping the attribute the way a bad `href` can.
 */
function filterAttributes(tag: string, attributes: ParsedAttribute[]): string | null {
  const parts: string[] = [];

  for (const attribute of attributes) {
    const name = attribute.name;
    const raw = attribute.value;

    // Every `on*` handler falls out of the allow-list below; it is called out here only
    // because it is the single most important thing this function drops.
    if (name === 'style') {
      if (raw === null) continue;
      const style = filterStyle(raw);
      if (style === null) continue;
      parts.push(`style="${escapeAttributeValue(style)}"`);
      continue;
    }

    if (tag === 'a' && name === 'href') {
      // Dropping the attribute but keeping the element preserves the link text, which is
      // usually meaningful contract prose (TC-01-UNIT-02 case 4).
      if (raw === null || !isSafeLinkHref(raw)) continue;
      parts.push(`href="${escapeAttributeValue(raw.trim())}"`);
      continue;
    }

    if (tag === 'img' && name === 'src') {
      if (raw === null || !isSafeImageSrc(raw)) return null;
      parts.push(`src="${escapeAttributeValue(raw.trim())}"`);
      continue;
    }

    if (tag === 'img' && name === 'alt') {
      parts.push(`alt="${escapeAttributeValue(raw ?? '')}"`);
      continue;
    }

    if ((tag === 'th' || tag === 'td') && (name === 'colspan' || name === 'rowspan')) {
      const value = (raw ?? '').trim();
      if (!/^\d+$/.test(value)) continue;
      parts.push(`${name}="${value}"`);
      continue;
    }
  }

  // An `<img>` with no source at all is an empty box; treat it as a removal so the author
  // is told, rather than silently emitting a broken element.
  if (tag === 'img' && !parts.some((part) => part.startsWith('src='))) return null;

  return parts.join(' ');
}

/** Reads one `<…>` construct starting at `position`, or null when it is a literal `<`. */
function readToken(html: string, position: number): Token | null {
  if (html.startsWith('<!--', position)) {
    const end = html.indexOf('-->', position + 4);
    return { kind: 'drop', end: end === -1 ? html.length : end + 3 };
  }

  if (html.startsWith('<!', position) || html.startsWith('<?', position)) {
    const end = html.indexOf('>', position);
    return end === -1 ? null : { kind: 'drop', end: end + 1 };
  }

  if (html[position + 1] === '/') {
    let cursor = position + 2;
    const start = cursor;
    while (cursor < html.length && isNameChar(html[cursor])) cursor++;
    const name = html.slice(start, cursor).toLowerCase();
    if (name.length === 0 || !isNameStart(name[0])) return null;
    const end = html.indexOf('>', cursor);
    if (end === -1) return null;
    return { kind: 'close', name, end: end + 1 };
  }

  if (!isNameStart(html[position + 1] ?? '')) return null;

  let cursor = position + 1;
  const start = cursor;
  while (cursor < html.length && isNameChar(html[cursor])) cursor++;
  const name = html.slice(start, cursor).toLowerCase();

  const attributes: ParsedAttribute[] = [];
  let selfClosing = false;

  for (;;) {
    while (cursor < html.length && isWhitespace(html[cursor])) cursor++;
    if (cursor >= html.length) return null; // Unterminated tag — treat the `<` as text.

    if (html[cursor] === '>') {
      cursor++;
      break;
    }
    if (html[cursor] === '/' && html[cursor + 1] === '>') {
      selfClosing = true;
      cursor += 2;
      break;
    }
    if (html[cursor] === '/' || html[cursor] === '=') {
      cursor++;
      continue;
    }

    const nameStart = cursor;
    while (
      cursor < html.length &&
      !isWhitespace(html[cursor]) &&
      html[cursor] !== '=' &&
      html[cursor] !== '>' &&
      html[cursor] !== '/'
    ) {
      cursor++;
    }
    const attributeName = html.slice(nameStart, cursor).toLowerCase();

    let lookahead = cursor;
    while (lookahead < html.length && isWhitespace(html[lookahead])) lookahead++;

    let value: string | null = null;
    if (html[lookahead] === '=') {
      cursor = lookahead + 1;
      while (cursor < html.length && isWhitespace(html[cursor])) cursor++;
      const quote = html[cursor];
      if (quote === '"' || quote === "'") {
        cursor++;
        const valueStart = cursor;
        while (cursor < html.length && html[cursor] !== quote) cursor++;
        value = html.slice(valueStart, cursor);
        cursor++; // Consume the closing quote.
      } else {
        const valueStart = cursor;
        while (cursor < html.length && !isWhitespace(html[cursor]) && html[cursor] !== '>') cursor++;
        value = html.slice(valueStart, cursor);
      }
    }

    attributes.push({ name: attributeName, value });
  }

  return { kind: 'open', name, attributes, selfClosing, end: cursor };
}

/** Index just past `</tag …>`, or the end of the string when the close tag is missing. */
function skipToCloseTag(html: string, tag: string, from: number): number {
  const needle = `</${tag}`;
  const lower = html.toLowerCase();
  let cursor = from;
  for (;;) {
    const found = lower.indexOf(needle, cursor);
    if (found === -1) return html.length;
    const after = lower[found + needle.length];
    if (after === undefined || after === '>' || isWhitespace(after)) {
      const end = html.indexOf('>', found);
      return end === -1 ? html.length : end + 1;
    }
    cursor = found + needle.length;
  }
}

/**
 * Allow-list sanitization of an authored template body.
 *
 * Deny-lists lose this game — there is always another vector — so anything not explicitly
 * permitted is removed. Two removal strategies are used deliberately: dangerous elements
 * take their contents with them, while merely-unsupported ones (`<marquee>`, `<font>`) are
 * unwrapped so the author does not lose prose to a formatting choice.
 *
 * The output is idempotent: sanitizing it again returns it unchanged, which is what makes
 * "store the sanitized body and re-sanitize on the next save" (FR-19) safe.
 */
export function sanitizeTemplateHtml(html: string): SanitizeResult {
  const source = html ?? '';
  const output: string[] = [];
  const removed = new Set<string>();

  let index = 0;
  while (index < source.length) {
    const next = source.indexOf('<', index);
    if (next === -1) {
      output.push(source.slice(index));
      break;
    }

    if (next > index) output.push(source.slice(index, next));

    const token = readToken(source, next);
    if (token === null) {
      // A `<` that does not start a tag is authored text, not markup. Escaping it keeps
      // the output well-formed without mangling entities or `{{placeholder}}` braces.
      output.push('&lt;');
      index = next + 1;
      continue;
    }

    if (token.kind === 'drop') {
      index = token.end;
      continue;
    }

    if (token.kind === 'close') {
      if (ALLOWED_TAGS.has(token.name) && !VOID_TAGS.has(token.name)) {
        output.push(`</${token.name}>`);
      }
      index = token.end;
      continue;
    }

    const { name } = token;

    if (CONTENT_STRIPPED_TAGS.has(name)) {
      removed.add(name);
      index =
        token.selfClosing || CONTENT_STRIPPED_VOID.has(name)
          ? token.end
          : skipToCloseTag(source, name, token.end);
      continue;
    }

    if (!ALLOWED_TAGS.has(name)) {
      // Unwrap: the tag goes, the text inside it stays.
      removed.add(name);
      index = token.end;
      continue;
    }

    const attributes = filterAttributes(name, token.attributes);
    if (attributes === null) {
      removed.add(name);
      index = token.selfClosing || VOID_TAGS.has(name) ? token.end : skipToCloseTag(source, name, token.end);
      continue;
    }

    const suffix = attributes.length > 0 ? ` ${attributes}` : '';
    output.push(VOID_TAGS.has(name) ? `<${name}${suffix} />` : `<${name}${suffix}>`);
    index = token.end;
  }

  return { html: output.join(''), removedElements: [...removed].sort() };
}

/* ------------------------------------------------------------------ *
 * Field-level validators
 * ------------------------------------------------------------------ */

const ok = (value: string): FieldResult => ({ valid: true, value });
const fail = (error: string): FieldResult => ({ valid: false, error });

export function validateTemplateName(input: string): FieldResult {
  const value = (input ?? '').trim();
  if (value.length === 0) return fail(TEMPLATE_MESSAGES.name.required);
  if (value.length > TEMPLATE_LIMITS.nameMax) return fail(TEMPLATE_MESSAGES.name.tooLong);
  return ok(value);
}

/** Absent and empty are the same thing here — the column is nullable. */
export function validateTemplateDescription(input: string | null | undefined): FieldResult {
  const value = (input ?? '').trim();
  if (value.length > TEMPLATE_LIMITS.descriptionMax) {
    return fail(TEMPLATE_MESSAGES.description.tooLong);
  }
  return ok(value);
}

/**
 * Reserved keys are checked *after* the pattern so an author who types `Signed_Date`
 * learns about the casing rule first — the more actionable of the two errors.
 */
export function validateFieldKey(input: string): FieldResult {
  const value = (input ?? '').trim();
  if (value.length === 0) return fail(TEMPLATE_MESSAGES.fieldKey.required);
  if (!FIELD_KEY_PATTERN.test(value)) return fail(TEMPLATE_MESSAGES.fieldKey.invalid);
  if (RESERVED_FIELD_KEYS.includes(value)) return fail(TEMPLATE_MESSAGES.fieldKey.reserved);
  return ok(value);
}

export function validateFieldLabel(input: string): FieldResult {
  const value = (input ?? '').trim();
  if (value.length === 0) return fail(TEMPLATE_MESSAGES.fieldLabel.required);
  if (value.length > TEMPLATE_LIMITS.fieldLabelMax) return fail(TEMPLATE_MESSAGES.fieldLabel.required);
  return ok(value);
}

/**
 * `unknown` rather than `string[]` because this value arrives as parsed JSON from the API
 * boundary, where the shape is a claim rather than a fact.
 */
export function validateSelectOptions(
  options: unknown,
): { valid: true; value: string[] } | { valid: false; error: string } {
  if (!Array.isArray(options)) return { valid: false, error: TEMPLATE_MESSAGES.options.tooFew };

  const value: string[] = [];
  for (const option of options) {
    if (typeof option !== 'string') return { valid: false, error: TEMPLATE_MESSAGES.options.tooFew };
    const trimmed = option.trim();
    if (trimmed.length === 0 || trimmed.length > TEMPLATE_LIMITS.selectOptionMax) {
      return { valid: false, error: TEMPLATE_MESSAGES.options.tooFew };
    }
    value.push(trimmed);
  }

  if (value.length < TEMPLATE_LIMITS.selectOptionsMin) {
    return { valid: false, error: TEMPLATE_MESSAGES.options.tooFew };
  }
  return { valid: true, value };
}

export interface SignerRole {
  key: string;
  label: string;
  order: number;
}

export type SignerRolesResult =
  | { valid: true; value: SignerRole[] }
  | { valid: false; error: string };

/**
 * Exactly two roles, distinct snake_case keys, orders 1 and 2 (FR-29). The count is
 * checked first because every other message is meaningless when the shape is wrong.
 * Returns the roles sorted by order so downstream code never has to re-sort to find the
 * first signer.
 */
export function validateSignerRoles(input: unknown): SignerRolesResult {
  if (!Array.isArray(input) || input.length !== 2) {
    return { valid: false, error: TEMPLATE_MESSAGES.signer.invalidCount };
  }

  const roles: SignerRole[] = [];
  for (const entry of input) {
    if (typeof entry !== 'object' || entry === null) {
      return { valid: false, error: TEMPLATE_MESSAGES.signer.invalidCount };
    }
    const candidate = entry as Partial<SignerRole>;

    const key = typeof candidate.key === 'string' ? candidate.key.trim() : '';
    if (!FIELD_KEY_PATTERN.test(key)) {
      return { valid: false, error: TEMPLATE_MESSAGES.signer.invalidKey };
    }

    const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
    if (label.length === 0 || label.length > TEMPLATE_LIMITS.signerLabelMax) {
      return { valid: false, error: TEMPLATE_MESSAGES.signer.invalidLabel };
    }

    const order = candidate.order;
    if (order !== 1 && order !== 2) {
      return { valid: false, error: TEMPLATE_MESSAGES.signer.invalidOrder };
    }

    roles.push({ key, label, order });
  }

  if (roles[0].key === roles[1].key) {
    return { valid: false, error: TEMPLATE_MESSAGES.signer.duplicateKeys };
  }
  if (roles[0].order === roles[1].order) {
    return { valid: false, error: TEMPLATE_MESSAGES.signer.invalidOrder };
  }

  return { valid: true, value: [...roles].sort((a, b) => a.order - b.order) };
}

const SIGNER_PREFIX = 'signer:';

/**
 * `FilledBy` is `sender` or `signer:{roleKey}` (FR-26). The unknown key is returned
 * separately so the API can answer with `{ error: 'unknown_signer_role', keys: [...] }`
 * and the editor can offer to repoint the field.
 */
export function validateFilledBy(
  filledBy: string,
  roleKeys: readonly string[],
): { valid: true; value: string } | { valid: false; error: string; unknownRoleKey?: string } {
  const value = (filledBy ?? '').trim();
  if (value === 'sender') return { valid: true, value };

  if (!value.startsWith(SIGNER_PREFIX)) {
    return { valid: false, error: TEMPLATE_MESSAGES.signer.unknownRole(value) };
  }

  const roleKey = value.slice(SIGNER_PREFIX.length);
  if (!roleKeys.includes(roleKey)) {
    return {
      valid: false,
      error: TEMPLATE_MESSAGES.signer.unknownRole(roleKey),
      unknownRoleKey: roleKey,
    };
  }

  return { valid: true, value };
}
