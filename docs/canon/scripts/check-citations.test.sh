#!/usr/bin/env bash
set -euo pipefail

# CN1's proof (check-citations.sh): runs the check over a scratch repository
# holding one cell of the family at a time, and fails unless each verdict is
# the expected one.

script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/check-citations.sh"
banner=$'// ════\n//  CANON IX — Planted\n'
# Built from parts, so this file holds no citation the check would read.
canon="docs/canon"
failures=0

# expect <ok|fail> <description> <path=content>...
expect() {
  local want="$1" what="$2"
  shift 2
  local repo
  repo="$(mktemp -d)"
  git -C "$repo" init -q
  mkdir -p "$repo/$canon"
  printf '%s' "$banner" > "$repo/$canon/real-canon.typ"
  for entry in "$@"; do
    mkdir -p "$repo/$(dirname "${entry%%=*}")"
    printf '%s' "${entry#*=}" > "$repo/${entry%%=*}"
  done
  git -C "$repo" add -A
  local got=ok
  (cd "$repo" && bash "$script" > /dev/null 2>&1) || got=fail
  if [ "$got" != "$want" ]; then
    echo "FAIL  $what: expected $want, got $got"
    failures=$((failures + 1))
  fi
  rm -rf "$repo"
}

expect ok "a canon in docs/canon" "$canon/other.typ=$banner"
expect fail "a canon outside docs/canon" "pkg/x.typ=$banner"
expect fail "a canon outside docs/canon with a non-ASCII name" "pkg/résumé.typ=$banner"
expect fail "a .typ file in docs/canon without the banner" "$canon/plain.typ=#set page()"
expect ok "other typst outside docs/canon" "pkg/main.typ=#set page()"
expect ok "a banner below line five is not a canon" $'pkg/late.typ=1\n2\n3\n4\n5\n//  CANON IX — Late\n'
expect fail "a canon whose second line is long" "pkg/long.typ=$banner$(head -c 300000 /dev/zero | tr '\0' 'x')"
expect ok "a citation that resolves" "src/a.ts=// see $canon/real-canon.typ"
expect fail "a dangling citation in source" "src/a.ts=// see $canon/gone.typ"
expect fail "a dangling citation in markdown" "README.md=See $canon/gone.typ."
expect fail "a dangling citation in a test" "tests/a.test.ts=expect(\"$canon/gone.typ\")"

if [ "$failures" -gt 0 ]; then
  echo "canon check self-test failed: $failures case(s)"
  exit 1
fi
echo "OK: the canon check gave the expected verdict in every case."
