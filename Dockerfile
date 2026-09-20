# syntax=docker/dockerfile:1

# Shared OS deps + pinned pnpm (avoids apt ×3 and corepack download ×3).
FROM node:22-slim AS base
WORKDIR /usr/src/app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.15.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Schema needed if postinstall ever runs; we ignore scripts and generate once in builder.
COPY prisma ./prisma
RUN --mount=type=cache,id=scavhunt-pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile --ignore-scripts

FROM base AS builder
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=deps /usr/src/app/package.json ./package.json
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Generate once, then build (package "build" also generates — call next directly).
RUN pnpm exec prisma generate && pnpm exec next build

# Production image: Next standalone server + Prisma CLI for migrate-on-start.
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=80
ENV HOME=/home/node

# CLI only — migrate deploy needs engines; app client comes from standalone trace.
RUN npm install -g prisma@6.16.2

COPY --from=builder --chown=node:node /usr/src/app/public ./public
COPY --from=builder --chown=node:node /usr/src/app/prisma ./prisma
COPY --from=builder --chown=node:node /usr/src/app/.next/standalone ./
COPY --from=builder --chown=node:node /usr/src/app/.next/static ./.next/static

USER node
EXPOSE 80
CMD ["sh", "-c", "prisma migrate deploy && exec node server.js"]
