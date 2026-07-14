#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Run by wasm-release.yml's `release` job after changesets/action reports a
# successful publish. Consumers pin an exact npm version rather than
# `workspace:*` (see scripts/wasm-link.sh for why), so changesets' own
# internal-dependency bumping never touches them - this is what bumps them
# instead, via a PR rather than a direct push to main.
#
# Usage: bump-wasm-consumers.sh <published.json>
#   published.json: changesets/action's `publishedPackages` output, e.g.
#   [{"name": "@some-ui/leetype-wasm", "version": "0.0.4"}, ...]

published_file="${1:?usage: bump-wasm-consumers.sh <published.json>}"
count=$(jq 'length' "$published_file")

if [ "$count" -eq 0 ]; then
  echo "No packages published; nothing to bump."
  exit 0
fi

mapfile -t consumers < <(git ls-files '*package.json' | grep -v '^crates/')

changed_files=()
for pkg_json in "${consumers[@]}"; do
  tmp=$(mktemp)
  cp "$pkg_json" "$tmp"
  file_changed=false
  for i in $(seq 0 $((count - 1))); do
    name=$(jq -r ".[$i].name" "$published_file")
    version=$(jq -r ".[$i].version" "$published_file")
    for field in dependencies devDependencies peerDependencies; do
      current=$(jq -r --arg f "$field" --arg p "$name" '.[$f][$p] // empty' "$tmp")
      if [ -n "$current" ] && [ "$current" != "workspace:*" ] && [ "$current" != "$version" ]; then
        jq --arg f "$field" --arg p "$name" --arg v "$version" '.[$f][$p] = $v' "$tmp" >"${tmp}.new"
        mv "${tmp}.new" "$tmp"
        file_changed=true
      fi
    done
  done
  if [ "$file_changed" = true ]; then
    cp "$tmp" "$pkg_json"
    changed_files+=("$pkg_json")
  fi
  rm -f "$tmp"
done

if [ "${#changed_files[@]}" -eq 0 ]; then
  echo "No consumer package.json needed a version bump."
  exit 0
fi

pnpm install --no-frozen-lockfile

git checkout main
git pull --ff-only origin main

branch="chore/bump-wasm-deps-$(date +%s)"
git checkout -b "$branch"
git add -- "${changed_files[@]}" pnpm-lock.yaml
git commit -m "chore(deps): bump published wasm packages in consumers"
git push -u origin "$branch"

body="Bumps consumer dependencies to match the wasm packages just published:

$(jq -r '.[] | "- \(.name)@\(.version)"' "$published_file")"

gh pr create \
  --title "chore(deps): bump published wasm packages in consumers" \
  --body "$body" \
  --base main \
  --head "$branch"
