#!/usr/bin/env bash
set -euo pipefail

# Copies the Node and pnpm versions the flake provides into the places outside
# Nix that pin them, or checks that they already match.
#
#   .nvmrc                           <- node        (npm ships with it)
#   package.json "packageManager"    <- pnpm@<pnpm>
#   apps/www/Dockerfile "FROM node:" <- node's major
#   pnpm-lock.yaml                   <- regenerated when packageManager moves
#
# Source of truth: nix/node/default.nix; never edit the copies by hand.
# pnpm-lock.yaml needs no check of its own: `pnpm install --frozen-lockfile`
# fails when its packageManagerDependencies disagree with packageManager.
#
# Usage:
#   scripts/sync-toolchain.sh           write the copies
#   scripts/sync-toolchain.sh --check   exit 1 if any copy differs

usage() {
  echo "usage: $0 [--check]" >&2
  exit 2
}

check=false
case $# in
  0) ;;
  1) [[ $1 == "--check" ]] || usage; check=true ;;
  *) usage ;;
esac

cd "$(dirname "$0")/.."

system=$(nix eval --impure --raw --expr builtins.currentSystem)
node=$(nix eval --raw ".#toolchain.$system.node")
pnpm=$(nix eval --raw ".#toolchain.$system.pnpm")
node_major=${node%%.*}

echo "flake toolchain: node $node, pnpm $pnpm"

# Each copy is one file and the sed program that rewrites it. Every program
# must match exactly one line, so a reformatted file fails loudly here
# instead of silently keeping a stale version.
files=(.nvmrc package.json apps/www/Dockerfile)
programs=(
  "s/^.*$/$node/"
  "s/^\(  \"packageManager\": \"pnpm@\)[^\"]*\(\",\)$/\1$pnpm\2/"
  "s/^\(FROM node:\)[0-9][0-9]*\(-alpine AS base\)$/\1$node_major\2/"
)

drift=false
for i in "${!files[@]}"; do
  file=${files[$i]}
  matches=$(sed -n -- "${programs[$i]}p" "$file" | wc -l)
  if [[ $matches -ne 1 ]]; then
    echo "error: expected '${programs[$i]}' to match one line in $file, it matched $matches" >&2
    exit 1
  fi
  expected=$(sed -- "${programs[$i]}" "$file")
  if [[ $expected == "$(cat -- "$file")" ]]; then
    continue
  fi
  if $check; then
    drift=true
    diff -u --label "$file" --label "$file (from flake)" -- "$file" <(echo "$expected") || true
  else
    echo "$expected" >"$file"
    echo "updated $file"
    if [[ $file == package.json ]]; then
      nix develop .#extension --command pnpm install --lockfile-only --no-frozen-lockfile
    fi
  fi
done

if $drift; then
  echo "error: these copies differ from the flake's toolchain; run scripts/sync-toolchain.sh" >&2
  exit 1
fi
