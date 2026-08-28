# The API image. Build context is the REPOSITORY ROOT, not apps/api:
#
#   docker build -f apps/api/Dockerfile .
#
# It has to be, because this is an npm workspaces monorepo and the API depends on
# `@devscribed/validation`, which lives in packages/. A context of apps/api could not see
# it.

# ---------------------------------------------------------------------------------------
# Manifests — shared by the two install stages so neither re-copies them
# ---------------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS manifests
WORKDIR /app

# Manifests before source, so a source-only change reuses both installs. The Prisma
# schema is copied with them rather than with the source: the API's `postinstall` runs
# `prisma generate`, which reads the schema, so `npm ci` fails without it.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/validation/package.json packages/validation/
COPY e2e/package.json e2e/
COPY apps/api/prisma apps/api/prisma

# The E2E workspace pulls Playwright's browser downloads, which this image neither needs
# nor should pay for. The API's own browser is installed deliberately, further down.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# OpenSSL, before any `npm ci` runs. The API's postinstall is `prisma generate`, which
# chooses its query-engine binary by detecting the OpenSSL version present — and this base
# image ships none, so without this it silently picks the 1.1.x engine that the runtime
# cannot load. `binaryTargets` in schema.prisma names the target outright and is the real
# fix; this keeps the detection honest as well, so the two cannot disagree.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------------------
# Runtime dependencies only
#
# A separate stage rather than a `npm prune` after the build: pruning leaves the pruned
# tree in the build layer anyway, and a layer that exists is a layer that ships. This is
# the difference between a 4.5 GB image and a manageable one.
# ---------------------------------------------------------------------------------------
FROM manifests AS prod-deps
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------------------
FROM manifests AS build
RUN npm ci

COPY packages/validation packages/validation
COPY apps/api apps/api

# `prebuild` compiles packages/validation to dist/, which the API imports as a built
# package rather than as source — the same shape the web app consumes.
RUN npm run build --workspace @devscribed/api

# ---------------------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
# Outside $HOME, so the browser survives whichever user the task ends up running as.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# The order of the next four steps is the difference between a five-minute deploy and a
# twenty-five-minute one. Layers are ordered by how often they change: fonts almost never,
# node_modules only when package-lock.json does, the browser with node_modules, and the
# application last. Putting the browser install after the application COPY — which is where
# it naturally lands when you write this file top-down — makes every one-line code change
# reinstall Chromium and re-push 400 MB.

# Fonts first. `--with-deps` below installs the shared libraries Chromium itself needs;
# these cover what the browser does not carry, Cyrillic above all.
#
# The RDS certificate authority bundle comes down in the same layer. RDS presents a
# certificate signed by an Amazon root that is not in any distribution trust store, and
# node-postgres treats `sslmode=require` as `verify-full` — so without this, every query
# fails with "self-signed certificate in certificate chain" and the API answers 500 to
# anything that touches the database. The alternative is to stop verifying the certificate,
# which would leave the connection encrypted but unauthenticated; this database holds signed
# contracts, so it is worth one download.
#
# The path is referenced by `ssl_root_cert_path` in infra/terraform/variables.tf, which
# builds it into the connection string. Change one and change the other.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        fonts-liberation fonts-dejavu-core fonts-noto-core fonts-noto-color-emoji \
        ca-certificates curl \
    && curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
        -o /etc/ssl/certs/rds-global-bundle.pem \
    && chmod 0444 /etc/ssl/certs/rds-global-bundle.pem \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Every COPY sets ownership as it writes. A `chown -R` afterwards would rewrite every inode
# into a second copy of the whole tree — a layer as large as the one it fixes.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/package.json ./package.json

# Chromium, for the PDF renderer, and it is not optional.
#
# `PdfRenderer` resolves its browser through `playwright-core` — hence this step after
# node_modules and not before — and when it cannot resolve one, it degrades to
# `fallback-pdf.ts`: a single-page, Helvetica-only, **Latin-1** writer. A Russian contract
# through that path is mojibake, so a signed document rendered without this browser would
# be worthless.
RUN npx playwright install --with-deps chromium \
    && chmod -R a+rX /ms-playwright \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# The application. Small, and the only layers a code-only change rebuilds.
COPY --from=build --chown=node:node /app/packages/validation/dist ./packages/validation/dist
COPY --from=build --chown=node:node /app/packages/validation/package.json ./packages/validation/package.json
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/prisma ./apps/api/prisma

WORKDIR /app/apps/api

# Not root. Fargate does not require it, which is exactly why it is easy to forget.
USER node

EXPOSE 4000
# `dist/main.js` and not `npm start`: npm would sit between the init process and node,
# swallowing SIGTERM, and a task that ignores SIGTERM is a task ECS kills after the
# 30-second grace period instead of letting it drain.
CMD ["node", "dist/main.js"]
