#!/usr/bin/env bash
# Builds an extension's AMO source archive the way a reviewer does, and fails
# unless that build is byte-identical to the extension's own.
#
# Why: AMO rejects a version whose source archive does not build, or builds
# something other than the submitted package, and nothing else checks that
# before a reviewer tries. The archive is a subset of the monorepo, so a
# workspace dependency or root config file it leaves out still builds fine in
# the repo; only an extract with nothing around it shows the gap.
#
# What it runs: package-source.sh, then, in an empty directory outside the
# repo, the first ```sh block under "## Steps" in the extension's
# README.build.md (so the instructions themselves are what is tested), then a
# SHA-256 comparison of every file in the two dist/ directories. The in-tree
# build is redone first, from the same tree, so a stale dist/ cannot pass or
# fail it. `git archive HEAD` packages committed files only: run it on a
# clean tree.
#
# Usage: verify-source-archive.sh <extension-dir>
# Only extensions submitted to AMO, the ones with an amo-notes.md (which
# extensions/docs/REVIEWER.md links), are checked; any other is skipped.
set -euo pipefail

EXTENSION_DIR="$(cd "${1:?usage: verify-source-archive.sh <extension-dir>}" && pwd)"
if [ ! -f "$EXTENSION_DIR/amo-notes.md" ]; then
  echo "No amo-notes.md in $EXTENSION_DIR: not submitted to AMO, nothing to verify."
  exit 0
fi
README="$EXTENSION_DIR/README.build.md"
if [ ! -f "$README" ]; then
  echo "::error::$EXTENSION_DIR is submitted to AMO (amo-notes.md) but has no README.build.md for its reviewer" >&2
  exit 1
fi
REPO_ROOT="$(git -C "$EXTENSION_DIR" rev-parse --show-toplevel)"
EXT_REL="$(realpath --relative-to="$REPO_ROOT" "$EXTENSION_DIR")"
NAME="$(node -p 'require(process.argv[1]).name' "$EXTENSION_DIR/package.json")"

STEPS="$(awk '/^## Steps/ { s = 1; next } s && /^```sh/ { c = 1; next } c && /^```/ { exit } c' "$README")"
if [ -z "$STEPS" ]; then
  echo "::error::$README has no \`\`\`sh block under \"## Steps\"" >&2
  exit 1
fi

if [ -n "$(git -C "$REPO_ROOT" status --porcelain --untracked-files=no)" ]; then
  echo "::warning::uncommitted changes: the archive packages HEAD, the in-tree build does not"
fi

WORK="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/source-archive.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

echo "::group::In-tree build of $NAME"
(cd "$REPO_ROOT" && pnpm --filter "$NAME" build)
echo "::endgroup::"

GITHUB_OUTPUT="$WORK/package-source.out" \
  bash "$REPO_ROOT/extensions/scripts/package-source.sh" "$EXTENSION_DIR"
ARCHIVE="$(sed -n 's/^SOURCE_ARCHIVE=//p' "$WORK/package-source.out")"

mkdir "$WORK/extract"
unzip -q "$ARCHIVE" -d "$WORK/extract"
echo "::group::README.build.md Steps, in the extracted archive"
printf '%s\n' "$STEPS"
(cd "$WORK/extract" && bash -euo pipefail -c "$STEPS")
echo "::endgroup::"

hashes() {
  (cd "$1" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum)
}
if ! diff -u --label "in-tree $EXT_REL/dist" --label "archive $EXT_REL/dist" \
  <(hashes "$EXTENSION_DIR/dist") <(hashes "$WORK/extract/$EXT_REL/dist"); then
  echo "::error::$NAME: the source archive builds a dist/ that differs from the in-tree build (diff above)" >&2
  exit 1
fi
echo "✅ $NAME: $(basename "$ARCHIVE") builds from a clean extract, identical to the in-tree dist/."
