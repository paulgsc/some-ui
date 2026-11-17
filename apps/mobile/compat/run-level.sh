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
# The row, <out-dir>/row.json: {api, webview, launch, paired, storm,
# refresh}, webview the image's WebView version and the rest each
# "pass", "fail" or "not run" (paired also "via debug build", where the
# release APK's Pair form could not be driven, and "no system CA", where the
# storm ran unpaired), which the stamp job tabulates.
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

# The level's row of the stamp: write_row <launch> <paired> <storm> <refresh>.
write_row() {
  node -e '
const [api, webview, launch, paired, storm, refresh, file] = process.argv.slice(1)
require("fs").writeFileSync(file, JSON.stringify({ api: Number(api), webview, launch, paired, storm, refresh }))
' "$api" "$webview" "$1" "$2" "$3" "$4" "$out/row.json"
  cat "$out/row.json"
}

# The WebView this image carries, for the stamp.
webview=$(adb shell dumpsys webviewupdate | tr -d '\r' \
  | grep -oE "Current WebView package \(name, version\): \([^)]*\)" \
  | grep -oE "[0-9][0-9.]+" | head -1 || true)
# Some images (API 24) do not name it there; then the provider's own
# version, read in the order Capacitor reads it below API 26
# (Bridge.isMinimumWebViewInstalled: Chrome first).
if [ -z "$webview" ]; then
  for provider in com.android.chrome com.google.android.webview com.android.webview; do
    webview=$(adb shell dumpsys package "$provider" | tr -d '\r' \
      | grep -oE "versionName=[0-9][0-9.]+" | head -1 | cut -d= -f2 || true)
    [ -n "$webview" ] && break
  done
fi
webview=${webview:-unknown}

# The bundle's floor: Vite's default target (baseline-widely-available),
# about Chrome 111, and the app's android.minWebViewVersion
# (apps/mobile/capacitor.config.ts). Below it Capacitor opens the update
# page (webview-too-old.html, #3117) in place of the app. A phone updated
# from Play is past the floor (Android 7 takes up to about 119), so such a
# level runs only OWV1's proof and says why the rest is not run.
#
# OWV1: on a WebView below the floor, every way into the app leaves the
# update page on screen (MainActivity.onNewIntent returns before any entry
# replaces it). Family: the entry (the plain icon, each wing's icon, the
# shortcut) x the start (cold, warm) x how Capacitor reads the WebView's
# version (API 26 and later from the current WebView package; 24 and 25
# from Chrome's). Proof: this block, run at a level of each version path
# (31 and 24): a cold start by the plain icon, each wing's icon and the
# shortcut warm, then a cold start by a wing's icon, each found by the
# page's title in the accessibility tree, with a screenshot of the first.
MIN_WEBVIEW=111
OLD_WEBVIEW_TITLE="This phone needs a newer WebView"
major=${webview%%.*}
if [[ "$major" =~ ^[0-9]+$ ]] && [ "$major" -lt "$MIN_WEBVIEW" ]; then
  why="stock WebView $major (needs ≥$MIN_WEBVIEW)"
  pkg=dev.paulgsc.someui
  missed=()
  # still_shown <entry>: the update page is on screen after that entry.
  still_shown() {
    (cd "$out/launch" && UI_WAIT_SECONDS=60 node "$here/ui.mjs" find "$OLD_WEBVIEW_TITLE" > /dev/null 2>> ui-errors.txt) ||
      missed+=("$1")
  }
  adb install -r "$apks/launch.apk" > /dev/null || missed+=("install")
  adb shell am start -W -n "$pkg/.MainActivity" > /dev/null
  still_shown "the plain icon, cold"
  adb exec-out screencap -p > "$out/launch/old-webview.png" || true
  # The wing icons, as launch-test.sh finds them (none listed on API 24 and
  # 25, which lack query-activities; the cold wing entry below still runs).
  aliases=$(adb shell cmd package query-activities --brief \
    -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -p "$pkg" 2> /dev/null \
    | tr -d '\r' | grep -oE "$pkg/[A-Za-z0-9_.]+" | grep -v '\.MainActivity$' || true)
  for component in $aliases; do
    adb shell am start -W -n "$component" > /dev/null
    still_shown "${component##*.}, warm"
  done
  adb shell am start -W -a dev.paulgsc.someui.NEW_IDEA -n "$pkg/.MainActivity" > /dev/null
  still_shown "the shortcut, warm"
  adb shell am force-stop "$pkg"
  adb shell am start -W -n "$pkg/.WingPractice" > /dev/null
  still_shown "WingPractice, cold"
  if [ "${#missed[@]}" -eq 0 ]; then
    shown="update page shown"
  else
    shown="blank"
  fi
  write_row "$shown" "$why" "$why" "$why"
  if [ "${#missed[@]}" -gt 0 ]; then
    echo "::error title=API $api::$why: the update page was not on screen after: $(IFS=';'; echo "${missed[*]}")."
    exit 1
  fi
  echo "::notice title=API $api::$why: the update page stayed on screen through every entry; the rest is not run."
  exit 0
fi

launch=fail
GITHUB_STEP_SUMMARY=${GITHUB_STEP_SUMMARY:-/dev/null} \
  bash "$here/../launch/launch-test.sh" "$apks/launch.apk" "$out/launch" && launch=pass

# The stand-in home's certificate, from a CA made for this level and
# trusted by nothing else.
certs=$(mktemp -d)
bash "$here/make-certs.sh" "$certs"

storm="not run"
refresh="not run"
paired="not run"
COMPAT_CERTS=$certs bash "$here/storm.sh" "$apks/launch.apk" "$apks/debug.apk" "$out/storm"
if [ -f "$out/storm/storm.json" ]; then
  read -r paired storm refresh < <(node -e '
const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
const paired = { paired: "pass", debug: "via-debug-build", no: "no-system-CA" }[r.paired] ?? "fail"
console.log(paired, r.storm.length ? "fail" : "pass", r.refresh.length ? "fail" : "pass")
' "$out/storm/storm.json")
  paired=${paired//-/ }
fi

write_row "$launch" "$paired" "$storm" "$refresh"

# A level that paired via the debug build, or ran unpaired for want of a
# system CA, says so in its row and is not failed for it.
[ "$launch" = pass ] && [ "$paired" != fail ] && [ "$storm" = pass ] && [ "$refresh" = pass ]
