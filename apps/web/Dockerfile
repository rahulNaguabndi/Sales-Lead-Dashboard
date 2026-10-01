# ─── Stage 1: Install all dependencies ───────────────────────────────────────
FROM node:20-alpine AS deps
# build tools required by better-sqlite3 native module
RUN apk add --no-cache python3 make g++
WORKDIR /monorepo

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN npm ci

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /monorepo

COPY --from=deps /monorepo/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
RUN npm run build -w apps/web

# ─── Stage 3: Runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache python3 make g++
WORKDIR /monorepo

ENV NODE_ENV=production

# All deps (includes tsx devDep needed to run the migration script at startup)
COPY --from=deps /monorepo/node_modules ./node_modules

# Monorepo root
COPY --from=builder /monorepo/package.json ./

# Shared package (workspace symlink target + imported by server code)
COPY --from=builder /monorepo/packages ./packages

# Next.js build output + static assets
COPY --from=builder /monorepo/apps/web/.next ./apps/web/.next
COPY --from=builder /monorepo/apps/web/public ./apps/web/public
COPY --from=builder /monorepo/apps/web/package.json ./apps/web/
COPY --from=builder /monorepo/apps/web/next.config.mjs ./apps/web/

# Server TypeScript source needed at startup for tsx db:migrate
COPY --from=builder /monorepo/apps/web/server ./apps/web/server

EXPOSE 3000
WORKDIR /monorepo/apps/web

# Run migrations then start; migrate is idempotent so safe on every restart
CMD ["/bin/sh", "-c", "../../node_modules/.bin/tsx server/db/migrate.ts && ../../node_modules/.bin/next start"]
