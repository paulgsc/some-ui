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
  tsconfig.json \
  -o "$ARCHIVE"

# Root package.json also lists devDependencies used by repo-wide tooling that
# isn't part of this minimal bundle (e.g. some-ui-utils, needed by Storybook's
# root-level decorators, whose source lives under packages/utils/ — not
# archived here). `git archive` above deliberately omits package.json so we
# can splice in a pruned copy instead of the real one: keeping those entries
# would make `pnpm install --frozen-lockfile` fail inside the extracted
# archive with an unresolvable `workspace:*` reference.
PRUNED_PKG_JSON="$(mktemp)"
ARCHIVE_ONLY_DEPS='["some-ui-utils","rollup"]'
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('$REPO_ROOT/package.json', 'utf8'));
  for (const dep of $ARCHIVE_ONLY_DEPS) {
    delete pkg.devDependencies?.[dep];
  }
  fs.writeFileSync('$PRUNED_PKG_JSON', JSON.stringify(pkg, null, 2) + '\n');
"
(cd "$(dirname "$PRUNED_PKG_JSON")" && cp "$PRUNED_PKG_JSON" package.json && zip -q "$ARCHIVE" package.json && rm -f package.json)
rm -f "$PRUNED_PKG_JSON"

# pnpm-lock.yaml was archived verbatim by the git archive above, so its root
# importer still lists the deps just pruned from package.json (each pointing
# at a `link:` path this archive doesn't include). Left as-is, that mismatch
# makes `pnpm install --frozen-lockfile` — the first command in
# README.build.md — fail for anyone extracting this archive. Prune the same
# entries from a copy of the lockfile and splice it in over the archived one.
PRUNED_LOCKFILE="$(mktemp)"
cp "$REPO_ROOT/pnpm-lock.yaml" "$PRUNED_LOCKFILE"
node "$REPO_ROOT/extensions/scripts/prune-lockfile-root-deps.mjs" "$PRUNED_LOCKFILE" "$ARCHIVE_ONLY_DEPS"
(cd "$(dirname "$PRUNED_LOCKFILE")" && cp "$PRUNED_LOCKFILE" pnpm-lock.yaml && zip -q "$ARCHIVE" pnpm-lock.yaml && rm -f pnpm-lock.yaml)
rm -f "$PRUNED_LOCKFILE"

echo "::notice::Source archive created: $ARCHIVE (git SHA: $GIT_SHA)"
echo "SOURCE_ARCHIVE=$ARCHIVE" >> "${GITHUB_OUTPUT:-/dev/null}"
echo "SOURCE_VERSION=$VERSION" >> "${GITHUB_OUTPUT:-/dev/null}"
echo "GIT_SHA=$GIT_SHA" >> "${GITHUB_OUTPUT:-/dev/null}"
