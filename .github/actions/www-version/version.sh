#!/usr/bin/env bash
set -euo pipefail

# `changeset version` consumes every pending changeset in .changeset/, not
# just the www-docker one written just before this step runs - left alone,
# it would also sweep up (and delete) any changeset still awaiting
# release.yml or wasm-release.yml's own runs, silently absorbing an
# unrelated npm package or wasm crate bump into this Docker-only release.
# Move everything else aside first and restore it after, so this release
# track only ever touches www's own changeset.
staging_dir=$(mktemp -d)
find .changeset -maxdepth 1 -name '*.md' ! -name 'www-docker-*.md' \
	-exec mv {} "$staging_dir/" \;

before=$(jq -r .version apps/www/package.json)
nix develop .#ci --command npx changeset version
after=$(jq -r .version apps/www/package.json)

# WR1 (#2601): this job bumps apps/www's version or fails. The bump is the
# release: its merge commit touching apps/www/package.json is what runs
# www-docker-release.yml's publish, so a release PR without it would merge
# and ship nothing. Family: any changesets version or config. Proof: this
# guard.
if [ "$before" = "$after" ]; then
	echo "::error::changeset version left apps/www at ${before}: no www-docker changeset was applied, so merging this release would publish nothing."
	exit 1
fi

shopt -s nullglob
other_changesets=("$staging_dir"/*.md)
if [ "${#other_changesets[@]}" -gt 0 ]; then
	mv "${other_changesets[@]}" .changeset/
fi
