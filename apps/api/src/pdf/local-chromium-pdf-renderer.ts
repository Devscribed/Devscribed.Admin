import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { renderFallbackPdf } from './fallback-pdf';
import { PdfRenderer } from './pdf-renderer';

/**
 * The development and test driver.
 *
 * Chromium comes from `playwright-core`, which the E2E suite already installs — no
 * second browser download, no `puppeteer` alongside `playwright`. It is a
 * *devDependency* and is imported dynamically, which is the same decision twice: the
 * production bundle on Vercel must not carry a browser launcher it will never call, and
 * an environment without the package has to degrade rather than fail at import time.
 *
 * **It degrades, never explodes.** If no Chromium executable can be resolved — a fresh
 * clone before `npx playwright install`, a CI image without browsers — the driver falls
 * back to the built-in writer in `fallback-pdf.ts` and logs a loud warning naming it.
 * Requirement 31 is the reason: a captured signature must not be lost because a browser
 * is missing, and the completion path must always end with real bytes to hash and store.
 */
@Injectable()
export class LocalChromiumPdfRenderer extends PdfRenderer implements OnModuleDestroy {
  private readonly logger = new Logger(LocalChromiumPdfRenderer.name);
  /** Cached so a browser that is missing is discovered once, not once per envelope. */
  private launcher?: Promise<ChromiumLauncher | undefined>;

  async render(html: string): Promise<Buffer> {
    const chromium = await this.resolveLauncher();
    if (!chromium) return this.fallback(html, 'no Chromium executable could be resolved');

    let browser: LaunchedBrowser | undefined;
    try {
      browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      const page = await browser.newPage();
      // `domcontentloaded` rather than `networkidle`: a document is self-contained HTML
      // with no external requests, and waiting for network quiet would only add the
      // timeout of whatever a template author happened to reference.
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const bytes = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
      });
      return Buffer.from(bytes);
    } catch (error) {
      // A launch that fails at runtime (a missing shared library, a sandbox refusal) is
      // the same class of problem as a missing binary, and gets the same treatment.
      return this.fallback(html, `Chromium render failed: ${describe(error)}`);
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Nothing is held open between renders — each render owns its browser — so there is
    // no pool to drain. The hook exists so that stays a decision, not an oversight.
  }

  private fallback(html: string, reason: string): Buffer {
    this.logger.warn(
      `PDF rendered by the built-in fallback writer, not Chromium (${reason}). ` +
        'Output is plain text on a single page and is not the production rendering. ' +
        'Run `npx playwright install chromium` to render properly.',
    );
    return renderFallbackPdf(html);
  }

  private resolveLauncher(): Promise<ChromiumLauncher | undefined> {
    this.launcher ??= (async () => {
      try {
        const playwright = (await import('playwright-core')) as { chromium: ChromiumLauncher };
        const chromium = playwright.chromium;
        // `executablePath()` throws when the browser was never downloaded, and returns a
        // path that may still not exist. Both are the same answer here: no browser.
        const executable = chromium.executablePath();
        if (!executable) return undefined;

        return chromium;
      } catch (error) {
        this.logger.warn(`playwright-core unavailable: ${describe(error)}`);
        return undefined;
      }
    })();

    return this.launcher;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The slice of Playwright this driver uses, declared locally so the dynamic import needs
 * no type-only dependency on a package the API does not require at build time.
 */
interface ChromiumLauncher {
  executablePath(): string;
  launch(options?: { args?: string[] }): Promise<LaunchedBrowser>;
}

interface LaunchedBrowser {
  newPage(): Promise<LaunchedPage>;
  close(): Promise<void>;
}

interface LaunchedPage {
  setContent(html: string, options?: { waitUntil?: string }): Promise<void>;
  pdf(options?: Record<string, unknown>): Promise<Uint8Array>;
}
