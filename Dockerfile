# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM node:24-alpine AS build

# Toolchain for native modules (bcrypt, sharp fallback builds)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts=false

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Keep only production dependencies for the runtime image
RUN npm prune --omit=dev && npm cache clean --force

# ---------- Runtime stage ----------
FROM node:24-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# tini reaps zombies and forwards SIGTERM so graceful shutdown in main.ts/worker.ts runs
RUN apk add --no-cache tini

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# Apache-2.0 requires the license and notice to ship with redistributions
COPY --chown=node:node LICENSE NOTICE ./

# The app writes rotating log files under ./logs
RUN mkdir -p /app/logs && chown node:node /app/logs

USER node

EXPOSE 4040

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${APP_PORT:-4040}/api/health/live" > /dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]

# API by default. Override for other processes:
#   worker:    ["node", "dist/worker.js"]
#   dashboard: ["node", "dist/dashboard.js"]
CMD ["node", "dist/main.js"]
