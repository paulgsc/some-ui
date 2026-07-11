
# syntax=docker/dockerfile:1.7

# ------------------------------------------------------------
# Stage 0: Base
# ------------------------------------------------------------
FROM node:24-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

RUN npm install -g pnpm turbo

WORKDIR /app

# ------------------------------------------------------------
# Stage 1: Prune workspace
#
# Generates a minimal workspace containing only the dependency
# graph required to build apps/www.
# ------------------------------------------------------------
FROM base AS pruner

COPY . .

RUN turbo prune www --docker

# ------------------------------------------------------------
# Stage 2: Install dependencies
#
# Only package.json files and lockfiles are copied here.
# Docker cache survives normal source edits.
# ------------------------------------------------------------
FROM base AS deps

COPY --from=pruner /app/out/json/ .

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ------------------------------------------------------------
# Stage 3: Build
# ------------------------------------------------------------
FROM base AS builder

#
# Rust toolchain
#
RUN apk add --no-cache \
        curl \
        build-base \
    && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
        | sh -s -- -y

ENV PATH="/root/.cargo/bin:${PATH}"

RUN cargo install wasm-pack

#
# Restore installed dependencies
#
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./

#
# Copy the complete pruned workspace
#
COPY --from=pruner /app/out/full/ .

#
# Build only the www application (and everything it depends on)
#
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm turbo build --filter=www...

# ------------------------------------------------------------
# Stage 4: Runtime
# ------------------------------------------------------------
FROM nginx:alpine AS runtime

RUN <<'EOF' > /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name localhost;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, no-transform";
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
}
EOF

COPY --from=builder /app/apps/www/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s \
    --timeout=3s \
    --start-period=5s \
    --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
