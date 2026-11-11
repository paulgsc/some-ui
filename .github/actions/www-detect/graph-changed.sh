#!/usr/bin/env bash
# How many build tasks turbo plans for the given `--filter`s, each scoped to a
# range (`pkg...[from...to]`): 0 means nothing they reach moved. Shared by
# detect.sh and render-docker-release.yml.
#
# TURBO_TELEMETRY_DISABLED silences turbo's one-time telemetry banner, which
# otherwise prints ahead of the JSON on a fresh CI runner (no persisted
# `~/.turbo/config.json`) and breaks a plain `jq` parse of stdout.
set -euo pipefail
TURBO_TELEMETRY_DISABLED=1 \
	nix develop .#ci --command pnpm turbo run build "$@" --dry=json |
	jq '.tasks | length'
