import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** The Meridian bundle lives outside the app; it is the single source of UI truth. */
const designSystem = path.resolve(here, '../../1_DS for dev');

const apiOrigin = process.env.API_ORIGIN || 'http://localhost:4000';

/** @type {import('next').NextConfig} */
export default {
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
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-src 'self'",
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
