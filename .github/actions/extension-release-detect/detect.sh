#!/usr/bin/env bash
set -euo pipefail

# Decides extension-release.yml's release_mode: `publish` or `release-pr`.
# See the workflow's header.
fail() {
	echo "::error::$1" >&2
	exit 1
}

release_mode=release-pr

if [ "$EVENT_NAME" = "workflow_dispatch" ] && [ "$PUBLISH_ONLY" = "true" ]; then
	# A retry signs the commit the run was dispatched on, which must be a
	# release commit on main: never whatever main has become since. Never a
	# tag: a `<name>@<version>` tag is what marks a version AMO accepted.
	[[ "$GITHUB_REF" == refs/heads/* ]] ||
		fail "Dispatch publish_only on a branch at the release commit, not ${GITHUB_REF}."
	git fetch --quiet origin main
	git merge-base --is-ancestor "$HEAD_SHA" origin/main ||
		fail "${HEAD_SHA} is not on main. Dispatch publish_only on a branch at the release commit."
	subject=$(git log -1 --format=%s "$HEAD_SHA")
	[[ "$subject" == "$RELEASE_COMMIT_MESSAGE"* ]] ||
		fail "${HEAD_SHA} is \"${subject}\", not a release commit (\"${RELEASE_COMMIT_MESSAGE} ...\"). Dispatch publish_only on a branch at the release commit."
	release_mode=publish
elif [ "$EVENT_NAME" = "push" ] && [ "$GITHUB_REF" = "refs/heads/main" ] &&
	[[ "$COMMIT_MESSAGE" == "$RELEASE_COMMIT_MESSAGE"* ]]; then
	release_mode=publish
fi

echo "release_mode=${release_mode}" >>"$GITHUB_OUTPUT"
