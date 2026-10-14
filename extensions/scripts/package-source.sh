#!/usr/bin/env bash
# Creates a reproducible source archive for AMO source code submission.
# Usage: run from any extension workspace directory, or pass the extension path as $1.
# Produces: <extension>/artifacts/source-<version>.zip
set -euo pipefail

EXTENSION_DIR="${1:-$(pwd)}"
EXTENSION_DIR="$(cd "$EXTENSION_DIR" && pwd)"
REPO_ROOT="$(git -C "$EXTENSION_DIR" rev-parse --show-toplevel)"
VERSION="$(node -p "require('$EXTENSION_DIR/package.json').version")"
GIT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
ARCHIVE="$EXTENSION_DIR/artifacts/source-$VERSION.zip"

mkdir -p "$EXTENSION_DIR/artifacts"

# What to archive: the extension's workspace dependency closure as pnpm
# resolves it, and the repo-root files its install and build read (both from
# source-closure.mjs, which says why neither is a list here), plus the
# reviewer docs. package.json and pnpm-lock.yaml are spliced in pruned, below.
# git archive only includes tracked files, so node_modules, dist and .env*
# never reach it.
CLOSURE_JSON="$(node "$REPO_ROOT/extensions/scripts/source-closure.mjs" "$EXTENSION_DIR")"
closure_field() {
  node -e '
    const value = JSON.parse(process.argv[1])[process.argv[2]];
    for (const item of value) console.log(item);
  ' "$CLOSURE_JSON" "$1"
}
mapfile -t WORKSPACE_DIRS < <(closure_field dirs)
mapfile -t ROOT_FILES < <(closure_field rootFiles)
ARCHIVE_ONLY_DEPS="$(node -e '
  console.log(JSON.stringify(JSON.parse(process.argv[1]).pruneRootDeps))
' "$CLOSURE_JSON")"

git -C "$REPO_ROOT" archive --format=zip HEAD \
  "${WORKSPACE_DIRS[@]/%//}" \
  "${ROOT_FILES[@]}" \
  extensions/docs/ \
  pnpm-lock.yaml \
  -o "$ARCHIVE"

# Root package.json lists workspace devDependencies used by repo-wide tooling
# (@some-ui/eslint-kit, say) that may sit outside this extension's closure.
# `git archive` above deliberately omits package.json so we can splice in a
# pruned copy instead of the real one: keeping those entries would make
# `pnpm install --frozen-lockfile` fail inside the extracted archive with an
# unresolvable `workspace:*` reference.
PRUNED_PKG_JSON="$(mktemp)"
node -e '
  const fs = require("fs");
  const [src, dst, prune] = process.argv.slice(1);
  const pkg = JSON.parse(fs.readFileSync(src, "utf8"));
  for (const dep of JSON.parse(prune)) {
    delete pkg.dependencies?.[dep];
    delete pkg.devDependencies?.[dep];
  }
  fs.writeFileSync(dst, JSON.stringify(pkg, null, 2) + "\n");
' "$REPO_ROOT/package.json" "$PRUNED_PKG_JSON" "$ARCHIVE_ONLY_DEPS"
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
