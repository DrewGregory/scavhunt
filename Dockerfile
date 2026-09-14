# syntax=docker/dockerfile:1

FROM node:22-slim

# Corepack reads the `packageManager` field in package.json and downloads the correct pnpm version.
RUN corepack enable

WORKDIR /usr/src/app

# Copy manifests first for better layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies.
RUN pnpm install --frozen-lockfile

# Copy application source.
COPY . .

# Build the Next.js app.
RUN pnpm build

# node:22-slim already has a `node` user — just fix ownership.
RUN chown -R node:node /usr/src/app

USER node
ENV HOME=/home/node

ENV NODE_ENV=production
EXPOSE 80

# Run Next.js directly with the real Node binary — no pnpm wrapper or shim at runtime.
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "80"]
