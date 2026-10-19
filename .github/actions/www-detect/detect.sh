#!/usr/bin/env bash
set -euo pipefail

# Is this push *the* release commit (the PR opened by the release-pr job
# just got merged), rather than an ordinary source change? That commit only
# touches apps/www/package.json + CHANGELOG.md, which still match this
# workflow's trigger paths - it must still run, but as a publish rather than
# another round of detection, or it would loop forever re-detecting its own
# version bump as "www changed".
is_release_commit=false
if [ "$EVENT_NAME" = "workflow_dispatch" ] && [ "$PUBLISH_ONLY" = "true" ]; then
	is_release_commit=true
elif [ "$EVENT_NAME" = "push" ] && [[ "$COMMIT_MESSAGE" == "$RELEASE_COMMIT_MESSAGE"* ]]; then
	is_release_commit=true
fi

# A release merged after this push already shipped it: the image is built
# from that release's tree, which contains this commit. Runs queue rather
# than replace each other (www-docker-release.yml, `queue: max`), and two
# queued runs can swap, so an ordinary run can start after a newer release;
# without this it would reopen a release PR for what already shipped.
shipped_since=false
if [ "$EVENT_NAME" = "push" ]; then
	while IFS= read -r subject; do
		if [[ "$subject" == "$RELEASE_COMMIT_MESSAGE"* ]]; then shipped_since=true; fi
	done < <(git log --format=%s "${HEAD_SHA}..origin/main")
fi

if [ "$is_release_commit" = "true" ]; then
	release_mode=publish
elif [ "$shipped_since" = "true" ]; then
	release_mode=skip
elif [ "$EVENT_NAME" = "workflow_dispatch" ]; then
	release_mode=release-pr
elif [ -z "$BASE_SHA" ] || [ "$BASE_SHA" = "0000000000000000000000000000000000000000" ]; then
	# First push to main we've seen (or history was rewritten) - no prior
	# state to diff against, so treat as changed.
	release_mode=release-pr
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
