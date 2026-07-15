#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# `version:` command for changesets/action in wasm-release.yml, standing in
# for its default `changeset version`.
#
# changesets treats any dependency whose *name* matches a workspace member
# as "internal", regardless of whether it's pinned via `workspace:` or a
# plain semver range - so a wasm crate bump cascades straight into every
# consumer's package.json in the same PR. That's wrong for this repo: those
# consumers pin an exact npm version on purpose (see wasm-link.sh), so that
# installing them never requires a local wasm-pack/rust toolchain. Letting
# changesets rewrite that pin here means main can reference an unpublished
# npm version until this PR merges, and consumers pick up a new wasm binary
# with no independent review or CI run - short-circuiting exactly what
# dependabot.yml's wasm-crates group exists to do once the version is
# actually published.
#
# So: run the real `changeset version` untouched (it's an external tool,
# not something to patch around), then revert whatever it did to any
# consumer that (a) has no changeset of its own this round - i.e. its only
# reason to be touched is the cascade - and (b) had a wasm crate's pinned
# version rewritten. A package with its own changeset keeps whatever
# cascaded pin bump rides along with it; that's a deliberate simplification,
# not an oversight. Packages connected only via `workspace:*` never get a
# version *string* rewritten in the first place, so there's nothing to
# revert for them regardless of how deep the cascade goes.

wasm_pkg_names=()
for d in crates/*/; do
  [ -f "${d}Cargo.toml" ] && [ -f "${d}package.json" ] || continue
  wasm_pkg_names+=("$(jq -r .name "${d}package.json")")
done

direct_pkg_names=()
for f in .changeset/*.md; do
  [ -f "$f" ] || continue
  [ "$(basename "$f")" = "README.md" ] && continue
  while IFS= read -r name; do
    [ -n "$name" ] && direct_pkg_names+=("$name")
  done < <(sed -n '/^---$/,/^---$/{/^---$/d;s/^"\{0,1\}\([^"[:space:]]*\)"\{0,1\}:.*/\1/p}' "$f")
done

npx changeset version

contains() {
  local needle="$1"
  shift
  local x
  for x in "$@"; do
    [ "$x" = "$needle" ] && return 0
  done
  return 1
}

revert_path() {
  local path="$1"
  if git ls-files --error-unmatch "$path" >/dev/null 2>&1; then
    git checkout HEAD -- "$path"
  else
    rm -f "$path"
  fi
}

while IFS= read -r file; do
  case "$file" in
  crates/*/package.json) continue ;;
  */package.json | package.json) ;;
  *) continue ;;
  esac
  [ -f "$file" ] || continue

  pkg_name=$(jq -r .name "$file" 2>/dev/null) || continue
  contains "$pkg_name" "${direct_pkg_names[@]:-}" && continue

  touched_wasm=false
  for wasm_name in "${wasm_pkg_names[@]:-}"; do
    if git diff -- "$file" | grep -q "\"${wasm_name}\":"; then
      touched_wasm=true
      break
    fi
  done
  $touched_wasm || continue

  echo "wasm-changeset-version: reverting cascade-only bump in $file"
  revert_path "$file"
  revert_path "$(dirname "$file")/CHANGELOG.md"
done < <(git status --porcelain=v1 | cut -c4-)
