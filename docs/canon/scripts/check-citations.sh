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
#       workspace was created to end.
#   C2. Every citation of a `docs/canon/*.typ` path, in any tracked file,
#       resolves to a file that exists. Canon paths are load-bearing: source
#       comments, ADRs, READMEs, and CI boundary scripts all cite them, and a
#       stale path silently turns a derivation into folklore.

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

violations=0

# ── C1: no canon outside docs/canon ──────────────────────────────────────
while IFS= read -r file; do
  case "$file" in
    docs/canon/*) ;;
    *)
      echo "C1  $file: .typ canons must live in docs/canon/ (see docs/canon/README.md)"
      violations=$((violations + 1))
      ;;
  esac
done < <(git ls-files '*.typ')

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
