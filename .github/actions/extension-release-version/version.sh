#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# `changeset version` consumes every pending changeset in .changeset/, not
# just this extension's own — left alone it would also sweep up (and
# delete) any changeset still awaiting release.yml, wasm-release.yml, or
# another extension's own release-pr run. Move everything else aside first
# and restore it after — same isolation trick as
# .github/actions/www-version/version.sh.
staging_dir=$(mktemp -d)
find .changeset -maxdepth 1 -name '*.md' ! -name "${CHANGESET_PREFIX}*.md" \
	-exec mv {} "$staging_dir/" \;

nix develop .#ci --command npx changeset version

shopt -s nullglob
other_changesets=("$staging_dir"/*.md)
if [ "${#other_changesets[@]}" -gt 0 ]; then
	mv "${other_changesets[@]}" .changeset/
fi

# `changeset version` only touches package.json + CHANGELOG.md. The
# manifest source (public/manifest.firefox.json) carries its own `version`
# field — the one AMO actually reads from the built xpi — and changesets
# has no idea it exists. Keep it in lockstep so this bot's bump is the
# whole story a reviewer needs to check, not half of it.
node extensions/scripts/sync-manifest-version.mjs "$EXTENSION_PATH"
