#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------
# Systemd resource limits (user scope)
# -----------------------------------
CPU_QUOTA="${CPU_QUOTA:-50%}"          # Max CPU usage
MEMORY_MAX="${MEMORY_MAX:-4G}"         # Max RAM
# TASKS_MAX="${TASKS_MAX:-15}"           # Max threads/processes
IO_WEIGHT="${IO_WEIGHT:-500}"          # IO weight (10-1000)
DESCRIPTION="${DESCRIPTION:-Scoped Build Process}"

# -----------------------------------
# Detect platform / CI
# -----------------------------------
if [ -n "${CI:-}" ] || [ "$(uname -s)" != "Linux" ]; then
  # On CI or non-Linux, just run the command
  exec "$@"
else
  # Run under systemd user scope with limits
  exec systemd-run --user --scope \
    --property=CPUQuota="$CPU_QUOTA" \
    --property=MemoryMax="$MEMORY_MAX" \
    --property=IOWeight="$IO_WEIGHT" \
    --property=Description="$DESCRIPTION" \
    "$@"
fi

