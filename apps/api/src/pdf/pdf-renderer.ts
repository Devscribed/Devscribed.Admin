/**
 * HTML → PDF.
 *
 * This is an abstraction for exactly one reason, stated in spec 02: the API deploys to
 * Vercel, where a Chromium binary does not fit the function bundle, so the real renderer
 * is a Lambda with a Chromium layer. Locally and in tests the driver is a locally
 * resolved Chromium — and, failing that, a built-in writer, because a missing browser
 * must never be able to fail CI or lose a captured signature.
 *
 * Abstract class rather than interface: Nest uses the class as the DI token.
 */
export abstract class PdfRenderer {
  /** Resolves to the PDF bytes. The result always begins with `%PDF`. */
  abstract render(html: string): Promise<Buffer>;
}
