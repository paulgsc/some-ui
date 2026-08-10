#!/usr/bin/env bash
set -euo pipefail

# Is this push *the* release commit (the release-pr job's PR just got
# merged), rather than an ordinary source change? That commit only touches
# .github/pages-release-marker.txt, which doesn't match pages.yml's own
# trigger paths - but workflow_dispatch publish_only covers the equivalent
# manual case, and a maintainer could still push it directly, so this stays
# symmetric with wasm-release.yml / www-docker-release.yml's own guard.
is_release_commit=false
# Supplying a rollback SHA is itself an explicit request to publish. Requiring
# the operator to also discover and tick publish_only makes the emergency path
# needlessly easy to no-op into a release PR.
if [ "$EVENT_NAME" = "workflow_dispatch" ] && { [ "$PUBLISH_ONLY" = "true" ] || [ -n "$ROLLBACK_SHA" ]; }; then
	is_release_commit=true
elif [ "$EVENT_NAME" = "push" ] && [[ "$COMMIT_MESSAGE" == "$RELEASE_COMMIT_MESSAGE"* ]]; then
	is_release_commit=true
fi

if [ "$is_release_commit" = "true" ]; then
	release_mode=publish
elif [ "$EVENT_NAME" = "push" ]; then
	# pages.yml's own `on.push.paths` filter already restricted this push to
	# one touching apps/www, packages/**, .storybook/**, pnpm-lock.yaml, or
	# this workflow's/action's own files - no need to re-diff here.
	release_mode=release-pr
elif [ "$EVENT_NAME" = "workflow_dispatch" ]; then
	release_mode=release-pr
else
	# pull_request - preview builds only, no release PR / deploy.
	release_mode=skip
fi

echo "release_mode=${release_mode}" >>"$GITHUB_OUTPUT"
