# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /monorepo

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/showroom/package.json ./apps/showroom/

RUN npm ci

COPY packages/shared/ ./packages/shared/
COPY apps/showroom/ ./apps/showroom/

# VITE_ vars are baked into the browser bundle at build time.
# VITE_INTAKE_URL must match where the *browser* can reach the web service.
# Default: localhost:3000 works when Docker ports are mapped to the host.
ARG VITE_INTAKE_URL=http://localhost:3000/api/intake/leads
ARG VITE_INTAKE_API_KEY=showroom-dev-key
ARG VITE_SHOW_DEMO_TOOLBAR=true
ARG VITE_MOCK_INTAKE=false

ENV VITE_INTAKE_URL=$VITE_INTAKE_URL
ENV VITE_INTAKE_API_KEY=$VITE_INTAKE_API_KEY
ENV VITE_SHOW_DEMO_TOOLBAR=$VITE_SHOW_DEMO_TOOLBAR
ENV VITE_MOCK_INTAKE=$VITE_MOCK_INTAKE

RUN npm run build -w apps/showroom

# ─── Stage 2: Serve ───────────────────────────────────────────────────────────
FROM nginx:alpine AS runner
COPY --from=builder /monorepo/apps/showroom/dist /usr/share/nginx/html
COPY apps/showroom/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
