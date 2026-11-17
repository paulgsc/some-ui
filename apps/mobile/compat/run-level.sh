#!/usr/bin/env bash
# One API level of android-compat.yml (COMPAT1), inside a booted emulator:
# slow it, run the launch test on the release APK, then the storm scenario
# on the debug APK, and write the level's row of the stamp.
#
#   bash apps/mobile/compat/run-level.sh <api> <apk-dir> <out-dir> <cpu-percent>
#
# <apk-dir> holds launch.apk (release, R8) and debug.apk. <cpu-percent> caps
# the emulator's process at that share of one host core (cpulimit), 0 for no
# cap; with the emulator's one core, that is how a slower phone is stood in
# for. Every step runs even when one before it failed, so the row says what
# each one found; the script fails if any did.
#
# The row, <out-dir>/row.json: {api, launch, storm, refresh}, each "pass",
# "fail" or "not run", which the stamp job tabulates.
set -uo pipefail

api=$1
apks=$2
out=$3
cpu=${4:-0}
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$out/launch" "$out/storm"

if [ "$cpu" -gt 0 ]; then
  qemu=$(pgrep -f qemu-system | head -1 || true)
  if [ -n "$qemu" ]; then
    sudo cpulimit -p "$qemu" -l "$cpu" -b > /dev/null 2>&1 || echo "::warning::cpulimit did not start; the emulator runs uncapped"
  else
    echo "::warning::no qemu process found to cap; the emulator runs uncapped"
  fi
fi

launch=fail
GITHUB_STEP_SUMMARY=${GITHUB_STEP_SUMMARY:-/dev/null} \
  bash "$here/../launch/launch-test.sh" "$apks/launch.apk" "$out/launch" && launch=pass

storm="not run"
refresh="not run"
bash "$here/storm.sh" "$apks/debug.apk" "$out/storm"
if [ -f "$out/storm/storm.json" ]; then
  storm=$(node -e 'const r=require(process.argv[1]); console.log(r.storm.length ? "fail" : "pass")' "$out/storm/storm.json")
  refresh=$(node -e 'const r=require(process.argv[1]); console.log(r.refresh.length ? "fail" : "pass")' "$out/storm/storm.json")
fi

node -e '
const [api, launch, storm, refresh, file] = process.argv.slice(1)
require("fs").writeFileSync(file, JSON.stringify({ api: Number(api), launch, storm, refresh }))
' "$api" "$launch" "$storm" "$refresh" "$out/row.json"
cat "$out/row.json"

[ "$launch" = pass ] && [ "$storm" = pass ] && [ "$refresh" = pass ]
