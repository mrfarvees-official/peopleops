# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
# openssl is needed by the Prisma schema engine (migrate deploy)
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Full source + dev tooling. The "migrate" service runs migrations and the seed from this stage.
# NODE_ENV is deliberately not "production" here: the seed refuses to run in production.
FROM deps AS tools
COPY . .

FROM tools AS builder
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    BACKUP_DIR=/data/backups
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
RUN mkdir -p /data/backups && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
