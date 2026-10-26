#!/usr/bin/env bash
set -euo pipefail

# Guards the two invariants that make docs/canon *canonical* rather than merely
# conventional. Kept as bash, alongside the repo's other CI guardrails
# (scripts/check-wasm-bindgen-boundary.sh, scripts/check-mutation-boundary.sh),
# which this is the third of.
#
#   C1. Every `.typ` canon in the repository lives in `docs/canon/`. A canon
#       filed next to the source it governs drifts out of reach of the other
#       workspaces that also depend on it - exactly the situation this
#       workspace was created to end. A canon is a `.typ` file whose header
#       carries the banner `//  CANON <numeral> — <title>` in its first five
#       lines; other typst (the résumé's sources in packages/ui/resume) is not
#       one. Every `.typ` file in `docs/canon/` carries the banner, so the
#       banner stays the definition.
#   C2. Every citation of a `docs/canon/*.typ` path, in any tracked file,
#       resolves to a file that exists. Canon paths are load-bearing: source
#       comments, ADRs, READMEs, and CI boundary scripts all cite them, and a
#       stale path silently turns a derivation into folklore.
#
# Promise CN1: this script exits 0 exactly when C1 and C2 hold, over every
# tracked `.typ` file (canon or other typst, in docs/canon or elsewhere) and
# every tracked text file that names a docs/canon path (source, docs, tests).
# Proof: check-citations.test.sh runs this script over a scratch repository
# holding each cell of that family, and pr.yml's `canon` job, which CI Gate
# needs, runs both.

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

violations=0

# ── C1: no canon outside docs/canon ──────────────────────────────────────
is_canon() { awk 'NR > 5 { exit } /^\/\/[[:space:]]+CANON [IVXLC]+ — / { found = 1; exit } END { exit !found }' "$1"; }

while IFS= read -r -d '' file; do
  case "$file" in
    docs/canon/*)
      if ! is_canon "$file"; then
        echo "C1  $file: a .typ file in docs/canon/ must open with the CANON banner (see docs/canon/README.md)"
        violations=$((violations + 1))
      fi
      ;;
    *)
      if is_canon "$file"; then
        echo "C1  $file: .typ canons must live in docs/canon/ (see docs/canon/README.md)"
        violations=$((violations + 1))
      fi
      ;;
  esac
done < <(git ls-files -z '*.typ')

# ── C2: every cited canon path exists ────────────────────────────────────
cited=0
while IFS= read -r path; do
  cited=$((cited + 1))
  if [ ! -f "$path" ]; then
    echo "C2  dangling canon citation: $path"
    violations=$((violations + 1))
  fi
done < <(git grep -I -h -o -E 'docs/canon/[A-Za-z0-9._-]+\.typ' -- . | sort -u)

if [ "$violations" -gt 0 ]; then
  echo
  echo "canon citation check failed: $violations violation(s)"
  exit 1
fi

echo "OK: all .typ canons live in docs/canon, and all $cited cited canon path(s) resolve."
