import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** The Meridian bundle lives outside the app; it is the single source of UI truth. */
const designSystem = path.resolve(here, '../../1_DS for dev');

/**
 * Where `/api/*` is proxied to.
 *
 * **Read at build time, not at run time.** Next resolves `rewrites()` during `next build`
 * and writes the destination into `.next/routes-manifest.json`; the server — standalone or
 * not — then serves from that manifest and never consults this variable again. Setting
 * `API_ORIGIN` on a running container therefore does nothing at all, silently, and the app
 * goes on proxying to whatever was baked in.
 *
 * So it is set at build time, by `apps/web/Dockerfile`, to a Cloud Map name that carries no
 * environment: dev and prod each resolve it inside their own VPC. Locally there is no such
 * name, and the default below is the API's dev-server port.
 */
const apiOrigin = process.env.API_ORIGIN || 'http://localhost:4000';

/**
 * The origin the embedded signing widget is served from (documents spec 04).
 *
 * **Read at build time, for exactly the reason `API_ORIGIN` above is.** `headers()` is
 * resolved during `next build` and written into `.next/routes-manifest.json` just like
 * `rewrites()`, so setting this on a running container does nothing at all, silently, and
 * the browser goes on refusing the frame.
 *
 * It exists because `/sign/*` carries a policy whose `frame-src` is `'self'` — see
 * `headers()` below — and a `<iframe src="https://www.signwell.com/…">` on that page is
 * refused outright without it. Nothing else in the policy changes: `script-src` in
 * particular is **not** widened, because no vendor script is loaded. The widget is hosted
 * in our own frame with our own origin-checked `postMessage` listener, precisely so that
 * the one page in the product that renders author-controlled HTML without a session never
 * executes third-party code.
 */
const embedOrigin = process.env.SIGNING_EMBED_ORIGIN || 'https://www.signwell.com';

/**
 * The two origins the product's typefaces come from (BUG-006).
 *
 * The design system pairs Space Grotesk with IBM Plex Sans and loads both from Google:
 * `@ds/styles.css` imports `tokens/fonts.css`, whose first statement is an `@import` of
 * `fonts.googleapis.com`. Webpack does not resolve a remote `@import` — it hoists it — so
 * the request is made by the browser, at runtime, from whatever page loaded the bundle.
 *
 * That is invisible on every other route, because `/sign/*` is the only one with a policy.
 * There it was refused, and the one page a counterparty ever sees was the one page in the
 * product rendering in the browser's fallback sans-serif — silently, because `display=swap`
 * paints the fallback first and the swap simply never came.
 *
 * **Both are needed and they are not interchangeable.** `fonts.googleapis.com` serves the
 * stylesheet, which `style-src` governs; that stylesheet's every `src` points at
 * `fonts.gstatic.com`, which `font-src` governs. Widening one leaves the same fallback
 * behind a different console message.
 *
 * Self-hosting the two faces would remove both — and remove a third-party request made by
 * a counterparty who never chose us — and is recorded in BUG-006 as the better answer that
 * was not taken here. The design system's own fonts file documents how.
 */
const fontStylesheetOrigin = 'https://fonts.googleapis.com';
const fontFileOrigin = 'https://fonts.gstatic.com';

/** @type {import('next').NextConfig} */
export default {
  /**
   * Ships a self-contained server with only the traced node_modules, so the container
   * image carries a fraction of the workspace install. Harmless locally: `next dev` and
   * `next start` ignore it, and only `next build` writes .next/standalone.
   */
  output: 'standalone',
  /**
   * Tracing has to start at the repository root, not at this app. Two of the app's
   * dependencies live above it — `packages/validation` and the design system — and a
   * trace rooted here would silently leave them out of the standalone bundle.
   */
  outputFileTracingRoot: path.resolve(here, '../..'),
  // Lets Next compile the .jsx design-system files that sit outside this app's root.
  experimental: { externalDir: true },
  webpack: (config) => {
    config.resolve.alias['@ds'] = designSystem;
    return config;
  },
  turbopack: {
    resolveAlias: { '@ds': designSystem },
  },
  // Same-origin proxy to the NestJS API, so the session cookie needs no CORS dance.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },

  /**
   * A restrictive CSP on `/sign/*` and nowhere else.
   *
   * Why this route needs one the rest of the application does not: it is the only page
   * served to people outside the organization, it renders **author-controlled HTML**
   * (a template body written by an admin, substituted with real values), and it is
   * reached by anyone holding a link — no session, no cookie, no login. The rest of the
   * app is behind a session and renders nothing an author wrote.
   *
   * The document itself is already confined to an `<iframe sandbox="">` with neither
   * `allow-scripts` nor `allow-same-origin`, which is the primary containment. This
   * header is the second line: if a sanitizer gap ever let markup through, the policy
   * caps what it could reach — no external origin to exfiltrate to (`default-src`,
   * `connect-src`), no plugins or `<base>` rewriting (`object-src`, `base-uri`), and no
   * embedding of this page in someone else's frame to phish a signature
   * (`frame-ancestors`).
   *
   * `script-src` keeps `'unsafe-inline'`: Next.js streams its hydration payload as
   * inline `<script>` tags, and a nonce would require moving every response through
   * middleware. That is an accepted, recorded weakening — and it is not what stands
   * between a malicious template and this page. The empty sandbox is.
   *
   * `style-src` and `font-src` each name one Google Fonts origin, for the reason given at
   * `fontStylesheetOrigin` above: the design system's typefaces are loaded from there by
   * every page, and this is the only page whose policy could refuse them.
   *
   * `'unsafe-eval'` is added **in development only**. `next dev` compiles client chunks
   * with an `eval`-based devtool, so without it this one route never hydrates at all: the
   * page stops at its loading spinner and no signer can sign locally or under the E2E
   * suite. A production build contains no `eval`, so the shipped policy is unchanged.
   */
  async headers() {
    return [
      {
        source: '/sign/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline'${
                process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"
              }`,
              `style-src 'self' 'unsafe-inline' ${fontStylesheetOrigin}`,
              "img-src 'self' data: blob:",
              `font-src 'self' data: ${fontFileOrigin}`,
              "connect-src 'self'",
              // Widened by exactly one origin, from the build-time variable above.
              `frame-src 'self' ${embedOrigin}`,
              "object-src 'none'",
              "base-uri 'none'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
          // Belt and braces for the frame-ancestors rule on older browsers.
          { key: 'X-Frame-Options', value: 'DENY' },
          // A signing URL carries the token; it must never travel in a Referer header.
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};
