#!/bin/sh
# What the render image builds (infra/render/Dockerfile runs this, at
# /opt/some-ui): the install of www's graph, the workspace packages the stage
# and the recorders load built (their `exports` name dist/), never the whole
# app, and then the stage, into apps/www/out/stage. pr.yml's render-stage job
# runs the same file in the Dockerfile's base image, from a checkout with no
# dist/, so a pull request that breaks this build fails before `main` (RI3).
#
#   sh infra/render/build.sh            install, build, build the stage
#   sh infra/render/build.sh --filters  print the turbo filters, one a line
#
# The filters (render-docker-release.yml's detect graph reads them here):
# - the stage's: read from its own imports (apps/www/scripts/stage-packages.ts,
#   RI3), never listed by hand, so they move with the stage.
# - the recorders': listed, and held by RI1
#   (apps/www/src/lib/render-image/__tests__/render-image.test.ts).
#   `record:playoff-delta` imports @some-ui/playoff-delta's `recording` entry,
#   which exists only once that package is built, and `record:report` imports
#   @some-ui/engagement's registry, which likewise loads only from its dist/.
set -eu
cd "$(dirname "$0")/../.."

filters() {
	pnpm exec tsx apps/www/scripts/stage-packages.ts --filters || exit 1
	printf '%s\n' \
		'--filter=@some-ui/playoff-delta...' \
		'--filter=@some-ui/honeycomb...' \
		'--filter=@some-ui/engagement...' \
		'--filter=@some-ui/video-render^...' \
		'--filter=@some-ui/video-motion^...'
}

if [ "${1:-}" = "--filters" ]; then
	filters
	exit 0
fi

pnpm install --frozen-lockfile --filter "www..."
# An assignment, so a failed read fails the build rather than building less.
build_filters="$(filters)"
# shellcheck disable=SC2086 # one filter a word
pnpm exec turbo run build $build_filters
pnpm --filter www build:stage
