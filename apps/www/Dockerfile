# -------------------------
# Stage 0: Base
# -------------------------
FROM node:20-alpine AS base

# Enable corepack and PNPM
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set PNPM_HOME environment variable
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Install Turbo globally
RUN pnpm add -g turbo

WORKDIR /app

# -------------------------
# Stage 1: Install dependencies (The Caching Stage)
# -------------------------
FROM base AS deps

# 1. Copy core workspace files first
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 2. 🔑 CRUCIAL FIX: Copy the entire folders for workspace packages.
# This ensures the directory structure exists for PNPM to validate the workspace,
# while the file content hash only changes when the package.json itself changes, 
# preserving layer caching.

# Copy all top-level workspace folders containing the package.json
# Note: Using wildcards for COPY can be tricky; explicit paths are safer for caching, 
# but for brevity, we'll rely on the folder structure being present.

# Apps
COPY apps/www ./apps/www

# Packages (Includes some-styles, some-vite-config, etc.)
COPY packages/eslint ./packages/eslint
COPY packages/mdx-generator ./packages/mdx-generator
COPY packages/rollup-config ./packages/rollup-config
COPY packages/some-content ./packages/some-content
COPY packages/some-styles ./packages/some-styles
COPY packages/some-vite-config ./packages/some-vite-config
COPY packages/tsconfig ./packages/tsconfig
COPY packages/types ./packages/types
COPY packages/utils ./packages/utils

# Nested Packages (e.g., packages/ui/*) - Adjust based on your actual structure
COPY packages/ui ./packages/ui

# Extensions
COPY extensions ./extensions

# Crates (Copy the folders containing package.json)
COPY crates/hangul-game-core ./crates/hangul-game-core
COPY crates/leetype_wasm ./crates/leetype_wasm
COPY crates/some-crossword ./crates/some-crossword
COPY crates/some-hexagon ./crates/some-hexagon
COPY crates/viewport-rotation ./crates/viewport-rotation

# 3. Install all dependencies (now PNPM finds all necessary folders)
RUN pnpm install --no-frozen-lockfile

# -------------------------
# Stage 2: Builder
# -------------------------
FROM base AS builder

# Install Rust and wasm-pack for building WASM crates
# Rust install is moved here to avoid polluting the smaller deps stage
RUN apk add --no-cache \
    curl \
    build-base \
    && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
    && . $HOME/.cargo/env \
    && cargo install wasm-pack

# Add Rust to PATH
ENV PATH="/root/.cargo/bin:${PATH}"

# Copy the entire workspace context for building
COPY . .

# Copy node_modules from deps stage
# Note: You only need to copy the *root* node_modules. PNPM symlinks packages 
# into the correct locations from the content-addressed store.
COPY --from=deps /app/node_modules ./node_modules

# Build www using turbo (this will build dependencies including crates)
RUN pnpm turbo build --filter=www...

# -------------------------
# Stage 3: Production runtime
# -------------------------
FROM nginx:alpine AS runtime

# Copy custom Nginx config
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { try_files $uri $uri/ /index.html; } \
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ { \
        expires 1y; add_header Cache-Control "public, no-transform"; } \
    add_header X-Frame-Options "SAMEORIGIN" always; \
    add_header X-XSS-Protection "1; mode=block" always; \
    add_header X-Content-Type-Options "nosniff" always; \
    add_header Referrer-Policy "no-referrer-when-downgrade" always; \
    add_header Content-Security-Policy "default-src '\''self'\'' http: https: data: blob: '\''unsafe-inline'\''" always; \
}' > /etc/nginx/conf.d/default.conf

# Copy built www
COPY --from=builder /app/apps/www/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
