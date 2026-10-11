#!/usr/bin/env bash
set -euo pipefail

# Decides extension-release.yml's release_mode: `publish` (with `ref`, the
# release commit to sign) or `release-pr`. See the workflow's header.
fail() {
	echo "::error::$1" >&2
	exit 1
}

release_mode=release-pr
ref=""

if [ "$EVENT_NAME" = "workflow_dispatch" ] && [ "$PUBLISH_ONLY" = "true" ]; then
	[ -n "$RELEASE_SHA" ] || fail "publish_only needs release_sha: the release commit on main to sign again."
	git fetch --quiet origin main
	sha=$(git rev-parse --verify --quiet "${RELEASE_SHA}^{commit}") ||
		fail "release_sha ${RELEASE_SHA} is not a commit in this repository."
	git merge-base --is-ancestor "$sha" origin/main ||
		fail "release_sha ${sha} is not on main."
	subject=$(git log -1 --format=%s "$sha")
	[[ "$subject" == "$RELEASE_COMMIT_MESSAGE"* ]] ||
		fail "release_sha ${sha} is \"${subject}\", not a release commit (\"${RELEASE_COMMIT_MESSAGE} ...\")."
	release_mode=publish
	ref=$sha
elif [ "$EVENT_NAME" = "push" ] && [ "$GITHUB_REF" = "refs/heads/main" ] &&
	[[ "$COMMIT_MESSAGE" == "$RELEASE_COMMIT_MESSAGE"* ]]; then
	release_mode=publish
	ref=$HEAD_SHA
fi

echo "release_mode=${release_mode}" >>"$GITHUB_OUTPUT"
echo "ref=${ref}" >>"$GITHUB_OUTPUT"
