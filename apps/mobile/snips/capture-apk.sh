#!/usr/bin/env bash
# The APK's half of a snip bundle (SNIPS1, docs/snips.md), run by
# snips-capture.yml's `apk` job inside a booted emulator: the screen pinned
# and stilled, the stand-in home up on sample data over https with a CA only
# this run trusts (COMPAT's rig, apps/mobile/compat), the app installed clean
# and paired through its own screen, then every route photographed by
# apps/www/tests/snips/apk.spec.ts.
#
#   bash apps/mobile/snips/capture-apk.sh <debug-apk> <out-dir>
#
# The debug APK: the release build's JavaScript, and the only build whose
# WebView Playwright can open, which is how each route is reached and the
# page's clock frozen. Sample data only: a fresh install, its one home the
# stub on the runner, answering fixtures (compat/stub-routes.json).
set -euo pipefail

apk=$1
out=$2
pkg=dev.paulgsc.someui
# pair-ui.sh reads $here (COMPAT's directory) and $out.
here=$(cd "$(dirname "$0")/../compat" && pwd)
repo=$(cd "$here/../../.." && pwd)
mkdir -p "$out"
: > "$out/ui-errors.txt"

# The screen: one size and density on every run, animations off, and the
# status bar in demo mode (a fixed clock, full battery and signal, no
# notifications), so a picture changes only when the app does.
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
bash "$here/trust-ca.sh" "$certs/ca.pem" > "$out/trust-ca.log" 2>&1
node "$here/stub-home.mjs" --port 8787 --control 8788 \
  --cert "$certs/home.pem" --key "$certs/home.key" > "$out/stub.log" 2>&1 &
stub_pid=$!
trap 'kill "$stub_pid" 2>/dev/null || true' EXIT
for _ in $(seq 1 20); do
  curl -sf http://127.0.0.1:8788/counts > /dev/null && break
  sleep 0.5
done

adb uninstall "$pkg" > /dev/null 2>&1 || true
adb install -r "$apk" > /dev/null
adb logcat -c
adb shell am start -W -n "$pkg/.MainActivity" > /dev/null
opened=no
for _ in $(seq 1 60); do
  if adb logcat -d -s SomeUI | grep -q "device storage: opened"; then
    opened=yes
    break
  fi
  sleep 1
done
if [ "$opened" != yes ]; then
  echo "::error title=Snips::the app's database never opened"
  exit 1
fi

# ui, hide_keyboard and pair_by_ui.
# shellcheck source=apps/mobile/compat/pair-ui.sh
source "$here/pair-ui.sh"
if ! pair_by_ui; then
  adb exec-out screencap -p > "$out/pair-failed.png" || true
  echo "::error title=Snips::the app's Pair form could not be driven (ui-errors.txt, pair-failed.png)"
  exit 1
fi

cd "$repo"
SNIPS_OUT="$out" SNIPS_APK=1 pnpm --filter www exec playwright test tests/snips/apk.spec.ts --trace off
