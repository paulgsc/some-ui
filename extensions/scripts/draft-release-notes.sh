#!/usr/bin/env bash
# Drafts changeset body bullets for an extension from commit subjects since
# its last automated release (falling back to when CHANGELOG.md was first
# added, for the very first run). This is a starting point, not finished
# prose: the release PR it feeds into (extension-release.yml) asks a human
# to edit it into real release notes before merging, since the CHANGELOG
# section it lands in becomes the public AMO "Version Notes" text.
#
# Usage: draft-release-notes.sh <extension-path>   e.g. extensions/suspender-ledger
set -euo pipefail

EXTENSION_PATH="$1"
NAME="$(basename "$EXTENSION_PATH")"

# The last commit whose message matches this extension's own release-commit
# convention (see extension-release.yml's RELEASE_COMMIT_MESSAGE) marks
# where the last automated release landed. A prefix match, not exact: a
# squash-merge's default commit message appends " (#123)" to the PR title,
# and detect.sh's own release-commit check is a prefix match for the same
# reason.
ANCHOR=$(git log --format=%H --grep="^chore(release): publish extension ${NAME}" -E -1 || true)

if [ -z "$ANCHOR" ]; then
  # No automated release yet — anchor to the commit that first added
  # CHANGELOG.md, i.e. the bootstrap entry for whatever version was last
  # published by hand.
  ANCHOR=$(git log --format=%H --diff-filter=A -- "${EXTENSION_PATH}/CHANGELOG.md" | tail -1)
fi

if [ -z "$ANCHOR" ]; then
  echo "- (draft) describe what changed since the last AMO release here"
  exit 0
fi

mapfile -t subjects < <(
  git log --format=%s "${ANCHOR}..HEAD" -- \
    "${EXTENSION_PATH}/src" \
    "${EXTENSION_PATH}/public" \
    "${EXTENSION_PATH}"/*.html \
    "${EXTENSION_PATH}/package.json" \
    2>/dev/null |
    grep -vE "^chore\(release\): publish extension ${NAME}" || true
)

if [ "${#subjects[@]}" -eq 0 ]; then
  echo "- (draft) describe what changed since the last AMO release here"
  exit 0
fi

for subject in "${subjects[@]}"; do
  echo "- ${subject}"
done
