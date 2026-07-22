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
};
