#!/usr/bin/env bash
# Creates a reproducible source archive for AMO source code submission.
# Usage: run from any extension workspace directory, or pass the extension path as $1.
# Produces: <extension>/artifacts/source-<version>.zip
set -euo pipefail

EXTENSION_DIR="${1:-$(pwd)}"
EXTENSION_DIR="$(cd "$EXTENSION_DIR" && pwd)"
REPO_ROOT="$(git -C "$EXTENSION_DIR" rev-parse --show-toplevel)"
EXT_RELPATH="$(realpath --relative-to="$REPO_ROOT" "$EXTENSION_DIR")"
VERSION="$(node -p "require('$EXTENSION_DIR/package.json').version")"
GIT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
ARCHIVE="$EXTENSION_DIR/artifacts/source-$VERSION.zip"

mkdir -p "$EXTENSION_DIR/artifacts"

# git archive only includes tracked files — naturally excludes node_modules, dist, .env*
#
# Include the workspace context needed by `pnpm install --frozen-lockfile`:
#   - The target extension directory
#   - extensions/common: shared extension utilities
#   - packages/eslint + packages/tsconfig + packages/some-styles: workspace devDeps extensions use
#   - Root config + lockfile: pnpm-workspace.yaml pins monorepo layout; pnpm-lock.yaml
#     pins exact dep versions; tsconfig.json is referenced by extension tsconfig extends chains
git -C "$REPO_ROOT" archive --format=zip HEAD \
  "$EXT_RELPATH/" \
  extensions/common/ \
  extensions/docs/ \
  packages/eslint/ \
  packages/tsconfig/ \
  packages/some-styles/ \
  pnpm-workspace.yaml \
  pnpm-lock.yaml \
  package.json \
  tsconfig.json \
  -o "$ARCHIVE"

echo "::notice::Source archive created: $ARCHIVE (git SHA: $GIT_SHA)"
echo "SOURCE_ARCHIVE=$ARCHIVE" >> "${GITHUB_OUTPUT:-/dev/null}"
echo "SOURCE_VERSION=$VERSION" >> "${GITHUB_OUTPUT:-/dev/null}"
echo "GIT_SHA=$GIT_SHA" >> "${GITHUB_OUTPUT:-/dev/null}"
