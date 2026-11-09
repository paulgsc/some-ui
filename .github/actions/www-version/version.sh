#!/usr/bin/env bash
set -euo pipefail

# Version only the Docker track; the shared policy preserves other intents
# and keeps foreign packages outside Changesets' workspace.
before=$(jq -r .version apps/www/package.json)
nix develop .#ci --command node scripts/release/track.mjs docker version
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
