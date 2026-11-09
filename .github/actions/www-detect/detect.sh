#!/usr/bin/env bash
set -euo pipefail

# Shared semantic detection recognizes a Docker version transition without
# depending on the squash commit's title, and ignores other tracks' metadata.
plan=$(mktemp)
GITHUB_OUTPUT="$plan" node scripts/release/track.mjs docker detect
release_mode=$(sed -n 's/^release_mode=//p' "$plan")
rm -f "$plan"

# Older queued source runs cannot reopen a release for a tree already covered
# by a newer Docker version. Compare actual versions rather than commit titles.
if [ "$EVENT_NAME" = "push" ] && [ "$release_mode" = "release-pr" ]; then
    git fetch -q origin main
    current=$(git show "${HEAD_SHA}:apps/www/package.json" | jq -r .version)
    latest=$(git show FETCH_HEAD:apps/www/package.json | jq -r .version)
    if [ "$current" != "$latest" ]; then release_mode=skip; fi
fi

if [ "$release_mode" != "release-pr" ] || [ "$EVENT_NAME" = "workflow_dispatch" ] ||
   [ -z "$BASE_SHA" ] || [[ "$BASE_SHA" =~ ^0+$ ]]; then
    :
else
	# `www...[from...to]` = www and everything it depends on, scoped to
	# what actually changed in that range. An empty task list means
	# nothing reachable from www moved.
	#
	# TURBO_TELEMETRY_DISABLED silences turbo's one-time telemetry
	# banner, which otherwise prints ahead of the JSON on a fresh CI
	# runner (no persisted `~/.turbo/config.json`) and breaks a plain
	# `jq` parse of stdout.
	task_count=$(
		TURBO_TELEMETRY_DISABLED=1 \
			nix develop .#ci --command pnpm turbo run build \
			--filter="www...[${BASE_SHA}...${HEAD_SHA}]" \
			--dry=json |
			jq '.tasks | length'
	)
	if [ "$task_count" -gt 0 ]; then
		release_mode=release-pr
	else
		release_mode=skip
	fi
fi

echo "release_mode=${release_mode}" >>"$GITHUB_OUTPUT"
