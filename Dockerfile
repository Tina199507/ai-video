# ---- Stage 1: Build frontend ----
FROM node:20-slim AS ui-build
WORKDIR /app
# Frontend lives at apps/ui-shell after direction A-2; the workspace
# alias @ai-video/shared resolves through the symlinked workspace tree
# so we copy the shared package, the ui-shell app, and the root
# package.json (which declares the workspace layout).
COPY package.json package-lock.json* ./
COPY packages/shared/ ./packages/shared/
COPY apps/ui-shell/ ./apps/ui-shell/
RUN npm ci --workspace @ai-video/app-ui-shell --include-workspace-root --ignore-scripts
RUN npm run build --workspace @ai-video/app-ui-shell

# ---- Stage 2: Runtime ----
FROM node:20-slim
WORKDIR /app

# Install FFmpeg + Chromium for pipeline
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    chromium \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Copy backend
COPY package.json package-lock.json* ./
# Workspaces declared in root package.json require the workspace
# package manifests to be present BEFORE `npm ci`, otherwise npm
# refuses to resolve the workspace tree.
COPY packages/ ./packages/
COPY apps/ ./apps/

# NOTE: We intentionally install dev deps because the runtime entry uses `tsx`
# to execute TypeScript directly. If you switch to a compiled `dist/` build,
# you can reintroduce `--omit=dev` here.
RUN npm ci --ignore-scripts \
    && npm prune --production=false

# Root `src/` holds optional repo-root TS compatibility shims; runtime uses
# `apps/server/src/main.ts` and workspace packages only — no COPY needed.
COPY tsconfig.json tsconfig.base.json ./

# Copy built frontend (serve as static if needed)
COPY --from=ui-build /app/apps/ui-shell/dist ./apps/ui-shell/dist

# Copy static data
COPY data/ ./data/

# Create data directory and set ownership
RUN mkdir -p /data && chown -R node:node /app /data

# Run as non-root user
USER node

VOLUME ["/data"]

EXPOSE 3220

ENV NODE_ENV=production
ENV PORT=3220

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3220/health').then(r=>{if(!r.ok)throw r.status}).catch(()=>process.exit(1))"

CMD ["node", "--import", "tsx", "apps/server/src/main.ts"]
