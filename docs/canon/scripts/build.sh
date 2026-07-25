#!/usr/bin/env bash
set -euo pipefail

# Compile every canon in this workspace to PDF.
#
# Typst is NOT a repository dependency and is NOT installed in CI. The canons
# are read as source far more often than they are read as PDFs (both by human
# reviewers and by LLM agents, which read the .typ directly), so compilation is
# a local convenience, not a build gate. This script therefore exits 0 with an
# explanatory message when `typst` is absent rather than failing - it is
# deliberately not wired into any turbo task for the same reason.

canon_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v typst >/dev/null 2>&1; then
  echo "typst not found on PATH - skipping canon PDF build."
  echo "Install from https://github.com/typst/typst to render locally; the .typ"
  echo "sources are the canonical artifact and need no build step to be read."
  exit 0
fi

shopt -s nullglob
canons=("$canon_dir"/*.typ)
if [ ${#canons[@]} -eq 0 ]; then
  echo "no .typ canons found in $canon_dir"
  exit 0
fi

mkdir -p "$canon_dir/dist"

failed=0
for canon in "${canons[@]}"; do
  out="$canon_dir/dist/$(basename "$canon" .typ).pdf"
  if typst compile "$canon" "$out"; then
    echo "built $out"
  else
    failed=$((failed + 1))
  fi
done

exit $((failed > 0 ? 1 : 0))
