# The web image. Build context is the REPOSITORY ROOT, not apps/web:
#
#   docker build -f apps/web/Dockerfile .
#
# It has to be. The app imports `@devscribed/validation` and the Meridian design system
# `@devscribed/ds` from packages/ — workspace packages that sit outside the Next.js app root.
# Both manifests go in before `npm ci` so the workspace links exist, and both sources after.

# ---------------------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/validation/package.json packages/validation/
COPY packages/ds/package.json packages/ds/
COPY e2e/package.json e2e/
# The API's postinstall runs `prisma generate`, which needs the schema even though this
# image never runs the API.
COPY apps/api/prisma apps/api/prisma

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci

COPY packages/validation packages/validation
COPY packages/ds packages/ds
COPY apps/web apps/web

# Where /api/* is proxied to, and it has to be set HERE rather than on the running task.
#
# Next.js resolves `rewrites()` while it builds and writes the destination into
# routes-manifest.json. The standalone server then serves from that manifest and never
# reads the environment variable again — so `API_ORIGIN` on the ECS task definition looks
# correct, changes nothing, and yields a web app that proxies to localhost and answers 500
# to every API call. It is baked in, once, here.
#
# `infra/deploy.sh` supplies it from `terraform output -raw api_internal_origin`, so the
# address the image is built with and the address Cloud Map answers on come from the same
# place. There is deliberately **no default**: a default would be silently wrong for one of
# the two environments, and this failure mode is invisible at run time.
ARG API_ORIGIN
ENV API_ORIGIN=${API_ORIGIN}
RUN test -n "${API_ORIGIN}" || { \
      echo "API_ORIGIN build argument is required."; \
      echo "Build through 'make deploy-<env>-web', which reads it from Terraform."; \
      exit 1; \
    }

# `next.config.mjs` sets `output: 'standalone'`, so this produces a self-contained server
# with only the node_modules it actually traced — a fraction of the install above.
ENV NEXT_TELEMETRY_DISABLED=1
RUN echo "baking API_ORIGIN=${API_ORIGIN} into the routes manifest" \
    && npm run build --workspace @devscribed/web

# ---------------------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Without this Next binds 127.0.0.1 inside the container and the load balancer's health
# check — which arrives on the task's ENI address — never gets an answer.
ENV HOSTNAME=0.0.0.0

# Two paths that look wrong and are not. Next always writes `standalone/` under the
# *app's* .next directory — `outputFileTracingRoot` changes the layout inside it, not
# where it lands. And because that root is the repository, the tree inside keeps the
# monorepo's shape, so the entry point ends up at apps/web/server.js.
COPY --from=build /app/apps/web/.next/standalone ./
# Static assets are not traced into standalone; they are copied alongside it, into the
# path the server expects to find them at. Without this every page loads unstyled.
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
