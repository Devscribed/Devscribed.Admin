/**
 * The web app talks to the NestJS API through a same-origin rewrite so the
 * session cookie (httpOnly) is set and sent without CORS. `/api/*` in the
 * browser is proxied to the API's `/api/*` routes.
 *
 * @type {import('next').NextConfig}
 */
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@devscribed/shared'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
