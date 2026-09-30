#!/usr/bin/env bash
set -euo pipefail

# `changeset version` consumes every pending changeset in .changeset/, not
# just the www-docker one written just before this step runs - left alone,
# it would also sweep up (and delete) any changeset still awaiting
# release.yml or wasm-release.yml's own runs, silently absorbing an
# unrelated npm package or wasm crate bump into this Docker-only release.
# Move everything else aside first and restore it after, so this release
# track only ever touches its own changeset. CHANGESET_PREFIX names that
# track's files (action.yml defaults it to www-docker-; mobile-apk.yml passes
# mobile-apk-), so a further track reuses this rather than forking it.
staging_dir=$(mktemp -d)
find .changeset -maxdepth 1 -name '*.md' ! -name "${CHANGESET_PREFIX}*.md" \
	-exec mv {} "$staging_dir/" \;

nix develop .#ci --command npx changeset version

shopt -s nullglob
other_changesets=("$staging_dir"/*.md)
if [ "${#other_changesets[@]}" -gt 0 ]; then
	mv "${other_changesets[@]}" .changeset/
fi
