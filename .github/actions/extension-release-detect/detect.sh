#!/usr/bin/env bash
set -euo pipefail

# Decides extension-release.yml's release_mode, and for a publish, the commit
# it signs:
#
#   publish     The release PR's squash-merge just landed on main (its message
#               starts with the release commit message), or a publish_only
#               retry named such a commit. `ref` is that commit.
#   release-pr  Anything else. The release-pr job rebuilds the extension from
#               main and itself decides whether the build differs from the
#               last release (extensions/scripts/amo-release.mjs prepare), so
#               no dependency-graph guess is made here: a lint or lockfile
#               change that leaves the bundle byte-identical opens nothing.
#
# A retry signs the commit it names, never whatever main has become since:
# the sign job refuses a dist/ that differs from the release record, and a
# newer tree under the same version number is exactly what it must not send.
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
