const apiOrigin = process.env.API_ORIGIN || 'http://localhost:4000';

/** @type {import('next').NextConfig} */
export default {
  // `@devscribed/ds` ships TypeScript source rather than a build, so Next compiles it the
  // way it compiles this app. No build step sits inside the pixel-tuning loop.
  transpilePackages: ['@devscribed/ds'],
  // Same-origin proxy to the NestJS API, so the session cookie needs no CORS dance.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};
