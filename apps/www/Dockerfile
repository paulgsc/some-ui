
# syntax=docker/dockerfile:1.7

# ------------------------------------------------------------
# Stage 0: Base
# ------------------------------------------------------------
FROM node:24-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

WORKDIR /app

COPY package.json ./package.json
RUN npm install -g "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")" turbo

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
# tar/xz are explicit (not just BusyBox's built-ins) because
# @some-ui/resume's build step downloads a pinned typst release as a
# .tar.xz and extracts it with system `tar` - relying on BusyBox tar's
# xz support being compiled in is a bad bet for a release pipeline.
#
# poppler-utils is here for the same reason: that package's build ends by
# reading its own compiled PDFs back with `pdftotext` to prove they expose
# extractable, correctly ordered text (scripts/check-ats.mjs). It is a build
# input, not a developer convenience - without it this stage fails with
# ENOENT. The nix shells provision it separately for CI and local dev; this
# image does not use them, so it needs its own copy.
#
RUN apk add --no-cache \
        curl \
        build-base \
        tar \
        xz \
        poppler-utils \
    && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
        | sh -s -- -y --default-toolchain stable

#
# Turborepo's default (strict) env mode strips RUSTUP_HOME/CARGO_HOME from
# task subprocesses, which breaks rustup's cargo/rustc proxy shims ("rustup
# could not choose a version of cargo to run"). Point PATH at the real
# toolchain bin directory instead of the proxies so the build doesn't
# depend on those env vars surviving into turbo's task processes.
#
ENV PATH="/root/.cargo/bin:${PATH}"
ENV PATH="/root/.rustup/toolchains/stable-x86_64-unknown-linux-musl/bin:${PATH}"

#
# Pre-install the wasm target so turbo's parallel per-crate wasm-pack
# tasks don't race each other downloading it into the same rustup cache
# (concurrent downloads corrupt the partial-file rename).
#
RUN rustup target add wasm32-unknown-unknown

RUN cargo install wasm-pack

#
# Restore installed dependencies
#
COPY --from=deps /app .

#
# Copy the complete pruned workspace
#
COPY --from=pruner /app/out/full/ .

#
# turbo prune only tracks the JS workspace, so it drops the Rust workspace
# root manifest and any crates not reachable from www's JS dependency
# graph. cargo needs every member listed in Cargo.toml's [workspace] to
# exist on disk, so restore the whole crates/ tree from the original
# build context alongside the root manifest.
#
COPY Cargo.toml Cargo.lock ./
COPY crates/ ./crates/

#
# turbo prune (above) only copies the packages reachable from www's
# dependency graph, so this image never has the full ~57-package workspace
# on disk - only the ~41 www actually needs. @some-ui/resume is one of
# those, and its build recounts workspace packages by walking the
# filesystem (scripts/check-claims.mjs) to catch its own resume.typ prose
# drifting from the real count. That recount is meaningless against a
# pruned checkout, so tell it not to run here rather than have it fail on
# a package total that was never wrong - full checkouts (local dev, the
# unfiltered CI build) still get the real check.
#
ENV SOME_UI_PRUNED_WORKSPACE=1

#
# Build only the www application (and everything it depends on).
#
# --concurrency=1: the wasm crates' `wasm-pack build` steps race each
# other over shared cargo/rustup state (the rust-std target download,
# wasm-pack's shared wasm-bindgen-cli cache install dir) when turbo runs
# them in parallel, corrupting partial downloads/installs. Building
# serially avoids that whole class of races.
#
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm turbo build --filter=www... --concurrency=1

# ------------------------------------------------------------
# Stage 4: Runtime
# ------------------------------------------------------------
FROM mirror.gcr.io/library/nginx:alpine AS runtime

COPY apps/www/nginx.security-headers.conf /etc/nginx/security-headers.conf

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

    include /etc/nginx/security-headers.conf;
}
EOF

COPY --from=builder /app/apps/www/dist /usr/share/nginx/html

EXPOSE 80

#
# BusyBox wget doesn't fall back across resolved addresses: since "localhost"
# resolves to ::1 before 127.0.0.1 in this image and nginx below only binds
# IPv4, `http://localhost/` fails every single check ("Connection refused")
# even though the server is up. Target 127.0.0.1 explicitly.
#
HEALTHCHECK --interval=30s \
    --timeout=3s \
    --start-period=5s \
    --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
