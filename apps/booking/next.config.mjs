import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This app lives in a subdirectory of a larger repo that has its own
  // lockfile; pin file tracing to this app so Next doesn't infer the repo root.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
