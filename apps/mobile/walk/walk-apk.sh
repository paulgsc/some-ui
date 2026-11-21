#!/usr/bin/env bash
# The APK's walks (WALK1, #3282): each app's scripted journey on the debug
# APK, against the stand-in home answering that walk's story sample, written
# by `motion walk` as snips and a walk.json (packages/video-motion/src/walk).
# Run by apps/mobile/snips/capture-apk.sh inside the booted emulator, once
# its snips are taken, on the screen it readied (demo-mode status bar, the
# clock at FROZEN_AT, animations off).
#
#   bash apps/mobile/walk/walk-apk.sh <debug-apk> <walks-dir> <certs-dir>
#
# <certs-dir> holds the stand-in home's certificate (home.pem, home.key),
# from the CA capture-apk.sh had the emulator trust. Each walk gets a clean
# install, paired through its own screen, and the stand-in home started
# afresh with stub-routes.json and the walk's sample laid over it. A walk
# that fails leaves failed.png and failed.txt in its folder, and the run's
# logs in <walks-dir>/logs. Sample data only: fixtures, no DNS.
set -euo pipefail

debug_apk=$1
walks=$2
certs=$3
here=$(cd "$(dirname "$0")/../compat" && pwd)
repo=$(cd "$here/../../.." && pwd)
out="$walks/logs"
mkdir -p "$walks" "$out"

# install, pair_by_ui (and native-log.sh's logcat reader, which reads
# $out/logcat.txt).
adb logcat -c
adb logcat > "$out/logcat.txt" 2>&1 &
logcat_pid=$!
stub_pid=
trap 'kill $stub_pid "$logcat_pid" 2>/dev/null || true' EXIT
# shellcheck source=apps/mobile/compat/pair-ui.sh
source "$here/pair-ui.sh"

# walk <app> <sample>: the stand-in home on that sample, a clean install
# paired with it, then the walk.
walk() {
  local app=$1 sample=$2
  node "$here/stub-home.mjs" --port 8787 --control 8788 \
    --routes "$here/stub-routes.json" --routes "$sample" \
    --cert "$certs/home.pem" --key "$certs/home.key" > "$out/stub-$app.log" 2>&1 &
  stub_pid=$!
  local up=no
  for _ in $(seq 1 20); do
    if curl -sf http://127.0.0.1:8788/counts > /dev/null; then
      up=yes
      break
    fi
    sleep 0.5
  done
  if [ "$up" != yes ]; then
    echo "::error title=Walks::the stand-in home never answered for $app (logs/stub-$app.log)"
    kill "$stub_pid" 2>/dev/null || true
    stub_pid=
    return 1
  fi
  local ok=yes
  if ! install "$debug_apk"; then
    echo "::error title=Walks::the debug APK's database never opened for $app (logs/logcat.txt)"
    ok=no
  elif ! pair_by_ui; then
    adb exec-out screencap -p > "$out/pair-failed-$app.png" || true
    echo "::error title=Walks::the Pair form could not be driven for $app (logs/pair-failed-$app.png)"
    ok=no
  else
    # The walk's microphone is the page's own (WALK3); granted so Android
    # never asks in front of a picture.
    adb shell pm grant "$pkg" android.permission.RECORD_AUDIO || true
    # The device's clock back at FROZEN_AT (apps/www/src/lib/snips), as
    # capture-apk.sh set it before the snips, so the walk's screens say the
    # same day and time whatever the snips took. The page's own clock runs
    # on from there: a take needs time to pass.
    adb shell date 110209302026.00 > /dev/null
    if ! (cd "$repo" && pnpm --filter @some-ui/video-motion motion walk "$app" \
      --sample "$sample" --out "$walks/$app"); then
      echo "::error title=Walks::the $app walk failed ($app/failed.png, $app/failed.txt)"
      ok=no
    fi
  fi
  kill "$stub_pid" 2>/dev/null || true
  wait "$stub_pid" 2>/dev/null || true
  stub_pid=
  [ "$ok" = yes ]
}

failed=0
walk jobs "$repo/apps/www/tests/walk/jobs-week.json" || failed=1
exit "$failed"
