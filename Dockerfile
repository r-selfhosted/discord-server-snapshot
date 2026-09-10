# syntax=docker/dockerfile:1.7

FROM node:26.8-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json tsconfig.test.json eslint.config.js .prettierrc ./
COPY src ./src
RUN npm run build

FROM node:26.8-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
  TINI_SUBREAPER=true
RUN apk add --no-cache tini \
  && mkdir -p /data/backups /data/status /data/locks /data/restore-history \
  && chown -R node:node /data /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force
COPY --from=build --chown=node:node /app/dist ./dist
USER node
VOLUME ["/data"]
ENTRYPOINT ["/sbin/tini", "--", "node", "dist/index.js"]
CMD ["daemon"]
HEALTHCHECK --interval=1m --timeout=10s --retries=3 --start-period=30s CMD node dist/index.js healthcheck
LABEL org.opencontainers.image.title="discord-server-snapshot" \
  org.opencontainers.image.description="Self-hosted point-in-time snapshots and recovery for Discord servers." \
  org.opencontainers.image.source="https://github.com/r-selfhosted/discord-server-snapshot" \
  org.opencontainers.image.licenses="MIT"
