#!/usr/bin/env bash
set -euo pipefail

# Is this push *the* release commit (the release PR opened by
# extension-release.yml's release-pr job just got merged), rather than an
# ordinary source change? That commit only touches this extension's
# package.json + manifest + CHANGELOG.md, which still match the workflow's
# trigger paths — it must still run, but as a publish rather than another
# round of detection, or it would loop forever re-detecting its own version
# bump as "the extension changed".
is_release_commit=false
if [ "$EVENT_NAME" = "workflow_dispatch" ] && [ "$PUBLISH_ONLY" = "true" ]; then
	is_release_commit=true
elif [ "$EVENT_NAME" = "push" ] && [[ "$COMMIT_MESSAGE" == "$RELEASE_COMMIT_MESSAGE"* ]]; then
	is_release_commit=true
fi

if [ "$is_release_commit" = "true" ]; then
	release_mode=publish
elif [ "$EVENT_NAME" = "workflow_dispatch" ]; then
	release_mode=release-pr
elif [ -z "$BASE_SHA" ] || [ "$BASE_SHA" = "0000000000000000000000000000000000000000" ]; then
	# First push to main we've seen (or history was rewritten) — no prior
	# state to diff against, so treat as changed.
	release_mode=release-pr
else
	# `<package>...[from...to]` = the package and everything it depends
	# on, scoped to what actually changed in that range. An empty task
	# list means nothing reachable from this extension moved.
	#
	# TURBO_TELEMETRY_DISABLED silences turbo's one-time telemetry
	# banner, which otherwise prints ahead of the JSON on a fresh CI
	# runner (no persisted ~/.turbo/config.json) and breaks a plain `jq`
	# parse of stdout.
	task_count=$(
		TURBO_TELEMETRY_DISABLED=1 \
			nix develop .#ci --command pnpm turbo run build \
			--filter="${PACKAGE_NAME}...[${BASE_SHA}...${HEAD_SHA}]" \
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
