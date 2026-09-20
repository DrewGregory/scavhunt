# syntax=docker/dockerfile:1

FROM node:22-slim AS deps
WORKDIR /usr/src/app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-slim AS builder
WORKDIR /usr/src/app
RUN corepack enable
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
RUN pnpm exec prisma generate && pnpm build

FROM node:22-slim AS runner
WORKDIR /usr/src/app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
ENV NODE_ENV=production
ENV PORT=80
COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/pnpm-lock.yaml ./
COPY --from=builder /usr/src/app/pnpm-workspace.yaml ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/.next ./.next
COPY --from=builder /usr/src/app/public ./public
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/next.config.js ./next.config.js
RUN pnpm exec prisma generate
RUN chown -R node:node /usr/src/app
USER node
ENV HOME=/home/node
EXPOSE 80
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && exec node node_modules/next/dist/bin/next start -p ${PORT:-80}"]
