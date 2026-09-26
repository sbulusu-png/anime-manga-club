# syntax=docker/dockerfile:1
# API image. Build from the repository root (the npm workspace lockfile lives there):
#   fly deploy . --config apps/api/fly.toml   (or: docker build -f apps/api/Dockerfile .)

FROM node:24-slim AS base
WORKDIR /app
# Every workspace manifest is needed so `npm ci` can match the root lockfile.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/e2e/package.json apps/e2e/

# Build: API dependencies plus the root dev tools (TypeScript).
FROM base AS build
RUN npm ci --workspace @amc/api --include-workspace-root
COPY tsconfig.base.json ./
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/
COPY apps/api/src apps/api/src
RUN npm run build --workspace @amc/api

# Runtime: the API's production dependencies only, compiled code and migrations.
# `npm ci --workspace` would still install every workspace's packages (Next.js, Playwright...),
# so the root manifest is narrowed to the API; versions still come from the lockfile.
# Peers are skipped (--legacy-peer-deps): better-auth lists test and database tools (vitest,
# drizzle-kit, pglite...) as peers, and everything the API uses is a direct dependency.
# node_modules: 523 MB -> 64 MB.
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm pkg set workspaces[0]=apps/api \
  && npm pkg delete devDependencies \
  && npm install --omit=dev --legacy-peer-deps --no-audit --no-fund \
  && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/drizzle apps/api/drizzle
WORKDIR /app/apps/api
USER node
EXPOSE 4000
CMD ["node", "--enable-source-maps", "dist/index.js"]
