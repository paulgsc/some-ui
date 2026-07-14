#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Temporarily relinks consumer packages to the local crates/* copy of a wasm
# package instead of its pinned npm version, so you can build/test against
# unreleased crate changes. Consumers otherwise pin an exact npm version
# (see wasm-release.yml's post-publish bump step) precisely so that turbo
# doesn't drag a wasm-pack build into every JS-only change.
#
# Usage:
#   scripts/wasm-link.sh                # link every consumer of every wasm crate
#   scripts/wasm-link.sh some-hexagon   # link only consumers of this crate
#
# After linking, build the crate itself before testing a consumer against
# it - turbo has no cache entry for a freshly-linked crate:
#   scripts/bootstrap-wasm-crates.sh some-hexagon
#   pnpm --filter <consumer> test
#
# Run scripts/wasm-unlink.sh when done to restore the pinned npm versions.

STATE_FILE=".wasm-link-state"
: >"$STATE_FILE"

if [ "$#" -gt 0 ]; then
  pkg_names=()
  for crate in "$@"; do
    name=$(jq -r '.name // empty' "crates/${crate}/package.json" 2>/dev/null || true)
    if [ -z "$name" ]; then
      echo "error: crates/${crate}/package.json not found or has no \"name\"" >&2
      exit 1
    fi
    pkg_names+=("$name")
  done
else
  mapfile -t pkg_names < <(
    for d in crates/*/; do
      jq -r '.name // empty' "${d}package.json" 2>/dev/null
    done | grep -v '^$'
  )
fi

mapfile -t consumers < <(git ls-files '*package.json' | grep -v '^crates/')

linked_any=false
for pkg_json in "${consumers[@]}"; do
  if ! git diff --quiet -- "$pkg_json" 2>/dev/null; then
    echo "skip: $pkg_json has uncommitted changes - commit or stash first" >&2
    continue
  fi

  tmp=$(mktemp)
  cp "$pkg_json" "$tmp"
  file_changed=false
  for name in "${pkg_names[@]}"; do
    for field in dependencies devDependencies peerDependencies; do
      current=$(jq -r --arg f "$field" --arg p "$name" '.[$f][$p] // empty' "$tmp")
      if [ -n "$current" ] && [ "$current" != "workspace:*" ]; then
        jq --arg f "$field" --arg p "$name" '.[$f][$p] = "workspace:*"' "$tmp" >"${tmp}.new"
        mv "${tmp}.new" "$tmp"
        file_changed=true
      fi
    done
  done

  if [ "$file_changed" = true ]; then
    cp "$tmp" "$pkg_json"
    echo "$pkg_json" >>"$STATE_FILE"
    linked_any=true
    echo "linked: $pkg_json"
  fi
  rm -f "$tmp"
done

if [ "$linked_any" = false ]; then
  echo "Nothing to link (no consumer package.json pins the given crate(s) by version)."
  rm -f "$STATE_FILE"
  exit 0
fi

pnpm install --no-frozen-lockfile
echo
echo "Done. Run scripts/wasm-unlink.sh to restore the pinned npm versions."
