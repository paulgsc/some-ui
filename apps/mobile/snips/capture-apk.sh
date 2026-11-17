#!/usr/bin/env bash
# The APK's half of a snip bundle (SNIPS1, docs/snips.md), run by
# snips-capture.yml's `apk` job inside a booted emulator. It readies the
# screen, starts the stand-in home over https with a CA only this run
# trusts (COMPAT's rig, apps/mobile/compat), then takes each build in turn:
# installs it clean, pairs it through its own screen, and runs
# apps/www/tests/snips/apk.spec.ts for it.
#
#   bash apps/mobile/snips/capture-apk.sh <release-apk> <debug-apk> <out-dir>
#
# The release APK first: the app as it ships, reached by its own taps. Then
# the debug APK (the same JavaScript, in a WebView Playwright opens) for
# every route by address. The bundle prefers the release picture of a
# screen. Sample data only: a fresh install whose one home is the stub on
# the runner, answering fixtures (compat/stub-routes.json).
set -euo pipefail

release_apk=$1
debug_apk=$2
out=$3
pkg=dev.paulgsc.someui
# pair-ui.sh reads $here (COMPAT's directory) and $out.
here=$(cd "$(dirname "$0")/../compat" && pwd)
repo=$(cd "$here/../../.." && pwd)
logs="$out/logs"
mkdir -p "$out" "$logs"
: > "$out/ui-errors.txt"

# The screen: one size and density on every run, animations off, the status
# bar in demo mode (a fixed clock, full battery and signal, no
# notifications), and the device's clock at FROZEN_AT
# (apps/www/src/lib/snips), which the release build reads, its page being
# closed to the capture. A picture changes only when the app does.
adb shell wm size 1080x2400
adb shell wm density 420
for scale in window_animation_scale transition_animation_scale animator_duration_scale; do
  adb shell settings put global "$scale" 0
done
adb shell settings put global sysui_demo_allowed 1
demo() { adb shell am broadcast -a com.android.systemui.demo -e command "$@" > /dev/null; }
demo enter
demo clock -e hhmm 0930
demo battery -e level 100 -e plugged false
demo network -e wifi show -e level 4 -e mobile hide
demo notifications -e visible false

certs=$(mktemp -d)
bash "$here/make-certs.sh" "$certs"
# trust-ca.sh also leaves adb running as root, which setting the clock needs.
bash "$here/trust-ca.sh" "$certs/ca.pem" > "$logs/trust-ca.log" 2>&1
adb shell settings put global auto_time 0
adb shell date 110209302026.00 > /dev/null
node "$here/stub-home.mjs" --port 8787 --control 8788 \
  --cert "$certs/home.pem" --key "$certs/home.key" > "$logs/stub.log" 2>&1 &
stub_pid=$!
trap 'kill "$stub_pid" 2>/dev/null || true' EXIT
for _ in $(seq 1 20); do
  curl -sf http://127.0.0.1:8788/counts > /dev/null && break
  sleep 0.5
done

# ui, hide_keyboard and pair_by_ui; ui.mjs's failures go to $out/ui-errors.txt,
# which the bundle job drops with logs/.
# shellcheck source=apps/mobile/compat/pair-ui.sh
source "$here/pair-ui.sh"

# A clean install of $2, opened, its database open, then paired.
take() {
  local build=$1 apk=$2
  adb uninstall "$pkg" > /dev/null 2>&1 || true
  adb install -r "$apk" > /dev/null
  adb logcat -c
  adb shell am start -W -n "$pkg/.MainActivity" > /dev/null
  local opened=no
  for _ in $(seq 1 60); do
    if adb logcat -d -s SomeUI | grep -q "device storage: opened"; then
      opened=yes
      break
    fi
    sleep 1
  done
  if [ "$opened" != yes ]; then
    echo "::error title=Snips::the $build APK's database never opened"
    return 1
  fi
  if ! pair_by_ui; then
    adb exec-out screencap -p > "$logs/pair-failed-$build.png" || true
    echo "::error title=Snips::the $build APK's Pair form could not be driven (ui-errors.txt, logs/pair-failed-$build.png)"
    return 1
  fi
  (cd "$repo" && SNIPS_OUT="$out" SNIPS_APK_BUILD="$build" \
    pnpm --filter www exec playwright test tests/snips/apk.spec.ts --trace off)
}

take release "$release_apk"
take debug "$debug_apk"
