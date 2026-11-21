#!/usr/bin/env bash
set -euo pipefail

# Workflow security (#2116): actionlint and zizmor over .github/, at pinned
# versions. A step of pr.yml's `guards` job runs this, and CI Gate needs it.
#
# WS2, its claim, family and tolerance: docs/ci-architecture.md, "Inputs
# reach the shell as data".
#
# Pins: ACTIONLINT_VERSION below (built with `go install`, which checks the
# module against Go's checksum database); zizmor and ShellCheck, with every
# wheel's hash, in scripts/workflow-security.requirements.txt. A bump changes
# the cache key below, so the next run installs the new version. Fix or
# suppress what a new version finds in the same change.
#
# Needs python3 (3.11+) and go. The tools are installed once into
# $WORKFLOW_SECURITY_TOOLS (default ~/.cache/some-ui/workflow-security).
#
# Usage:
#   scripts/check-workflow-security.sh             check (installs if needed)
#   scripts/check-workflow-security.sh --all       also print zizmor's medium
#                                                  and lower findings
#                                                  (never fails on them)

ACTIONLINT_VERSION=1.7.12

all=false
case $# in
  0) ;;
  1) [[ $1 == "--all" ]] || { echo "usage: $0 [--all]" >&2; exit 2; }; all=true ;;
  *) echo "usage: $0 [--all]" >&2; exit 2 ;;
esac

root=$(git rev-parse --show-toplevel)
cd "$root"

requirements=scripts/workflow-security.requirements.txt
key=$({ cat "$requirements"; echo "actionlint $ACTIONLINT_VERSION"; } | sha256sum | cut -c1-16)
base=${WORKFLOW_SECURITY_TOOLS:-${XDG_CACHE_HOME:-$HOME/.cache}/some-ui/workflow-security}
tools="$base/$key"

if [ ! -f "$tools/.complete" ]; then
  echo "Installing actionlint $ACTIONLINT_VERSION, zizmor and ShellCheck into $tools"
  mkdir -p "$base"
  staging=$(mktemp -d "$tools.XXXXXX")
  python3 -m venv "$staging/venv"
  "$staging/venv/bin/pip" install --quiet --disable-pip-version-check \
    --no-deps --only-binary=:all: --require-hashes -r "$requirements"
  GOBIN="$staging/bin" go install "github.com/rhysd/actionlint/cmd/actionlint@v$ACTIONLINT_VERSION"
  touch "$staging/.complete"
  rm -rf "$tools"
  mv "$staging" "$tools"
fi

actionlint="$tools/bin/actionlint"
zizmor="$tools/venv/bin/zizmor"
shellcheck="$tools/venv/bin/shellcheck"

status=0

echo "── actionlint $ACTIONLINT_VERSION ($("$shellcheck" --version | sed -n 's/^version: /ShellCheck /p'))"
"$actionlint" -config-file .github/actionlint.yaml -shellcheck "$shellcheck" -pyflakes "" || status=1

echo "── $("$zizmor" --version)"
if $all; then
  "$zizmor" --offline --config .github/zizmor.yml --no-exit-codes .github/
fi
"$zizmor" --offline --config .github/zizmor.yml --min-severity high .github/ || status=1

exit "$status"
