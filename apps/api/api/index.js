/**
 * Vercel serverless entry point for the NestJS API.
 *
 * This file is deliberately plain CommonJS that requires the *compiled* `dist/`, not the
 * TypeScript sources: Vercel bundles functions with esbuild, which does not implement
 * `emitDecoratorMetadata`, and without that metadata Nest's dependency injection cannot
 * resolve a single constructor parameter. `nest build` does the compiling; this file only
 * boots what it produced.
 *
 * The Express instance underneath Nest is itself a `(req, res)` handler, so no
 * serverless-express shim is needed — the adapter's instance is handed to Vercel as is.
 */
const { createApp } = require('../dist/bootstrap');

/**
 * Cached across invocations that reuse a warm instance, so only a genuine cold start pays
 * for module scanning and the first database connection. It caches the *promise*, which is
 * what keeps two concurrent requests on a fresh instance from bootstrapping Nest twice.
 */
let handlerPromise;

function getHandler() {
  if (!handlerPromise) {
    handlerPromise = createApp()
      .then(async (app) => {
        // `listen()` is what normally triggers this; serverless never listens.
        await app.init();
        return app.getHttpAdapter().getInstance();
      })
      .catch((error) => {
        // Otherwise a bootstrap failure is cached forever and every later request on this
        // instance fails with the same stale error, hiding a transient cause.
        handlerPromise = undefined;
        throw error;
      });
  }

  return handlerPromise;
}

module.exports = async (req, res) => {
  const handler = await getHandler();
  return handler(req, res);
};
