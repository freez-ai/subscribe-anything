# syntax=docker/dockerfile:1

# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Build tools needed for native modules (isolated-vm, better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
# Ensure public directory exists (Next.js treats it as optional)
RUN mkdir -p public
RUN npm run build

# ─── Stage 2: Runner ─────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# System libraries required by Playwright Chromium
RUN apt-get update && apt-get install -y \
    # Chromium runtime deps
    libglib2.0-0 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    libpango-1.0-0 libpangocairo-1.0-0 libcairo2 \
    libx11-6 libx11-xcb1 libxcb1 libxext6 libxss1 libxcursor1 \
    libxi6 libxtst6 libgtk-3-0 libgdk-pixbuf2.0-0 \
    fonts-liberation fonts-noto-cjk \
    # Misc
    ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
# Store Playwright browser binaries inside the app directory so they
# survive volume mounts and are included in the image layer.
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.playwright-browsers

# Copy built artifacts from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next        ./.next
COPY --from=builder /app/dist         ./dist
COPY --from=builder /app/drizzle      ./drizzle
COPY --from=builder /app/public       ./public

# Download Playwright Chromium binary
RUN node_modules/.bin/playwright install chromium

EXPOSE 3000

CMD ["node", "dist/server.js"]
