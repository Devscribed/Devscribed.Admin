'use client';

/**
 * The frozen document, rendered the only way author-controlled HTML is allowed to be
 * rendered anywhere in this application: an iframe whose `sandbox` is the **empty
 * string** — no `allow-scripts`, no `allow-same-origin`.
 *
 * Template bodies are written by admins and shown to strangers on `/sign/{token}`. On a
 * shared origin, script in a template would be session theft, and `allow-same-origin`
 * alone would hand it the parent's storage. `srcDoc` rather than a URL keeps the document
 * opaque and same-request. This is one of the four mitigations the area's README names;
 * the other three (server-side sanitization, value escaping, and the CSP on `/sign/*`)
 * live outside this component, and none of them is a substitute for it.
 */
export function DocumentFrame({
  html,
  testId,
  title,
  height,
}: {
  html: string;
  testId: string;
  title: string;
  /** The signing page wants a taller, scrollable frame than the detail tab. */
  height?: string;
}) {
  return (
    <iframe
      title={title}
      data-testid={testId}
      sandbox=""
      srcDoc={html}
      style={{
        display: 'block',
        width: '100%',
        height: height ?? '65vh',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--paper-0)',
      }}
    />
  );
}
