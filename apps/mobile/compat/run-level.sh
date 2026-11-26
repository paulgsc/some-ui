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
# refresh, name}, webview the image's WebView version and the rest each
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

# The level's row of the stamp: write_row <launch> <paired> <storm> <refresh>
# [<name>], name "<asked>/<past cache>" from the name scenario, or not run.
write_row() {
  node -e '
const [api, webview, launch, paired, storm, refresh, name, file] = process.argv.slice(1)
require("fs").writeFileSync(file, JSON.stringify({ api: Number(api), webview, launch, paired, storm, refresh, name }))
' "$api" "$webview" "$1" "$2" "$3" "$4" "${5:-not run}" "$out/row.json"
  cat "$out/row.json"
}

# The WebView this image carries, for the stamp.
webview=$(adb shell dumpsys webviewupdate | tr -d '\r' \
  | grep -oE "Current WebView package \(name, version\): \([^)]*\)" \
  | grep -oE "[0-9][0-9.]+" | head -1 || true)
# Some images (API 24) do not name it there; then the provider's own
# version, read as Capacitor reads it below API 26
# (Bridge.isMinimumWebViewInstalled: Chrome, then com.android.webview).
if [ -z "$webview" ]; then
  for provider in com.android.chrome com.android.webview; do
    webview=$(adb shell dumpsys package "$provider" | tr -d '\r' \
      | grep -oE "versionName=[0-9][0-9.]+" | head -1 | cut -d= -f2 || true)
    [ -n "$webview" ] && break
  done
fi
webview=${webview:-unknown}

# The route scenario alone (#3411, NA2), which needs no WebView: its result
# is the name column's, "s26 / s21 / keptoff / saver", each "<as is>,<fixed>".
if [ "${ROUTE_ONLY:-false}" = true ]; then
  bash "$here/route.sh" "$apks" "$out/route"
  name=$(node -e 'const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(["s26", "s21", "keptoff", "saver"].map((k) => k + " " + r[k].as_is + "," + r[k].fixed).join(" / "))' "$out/route/route.json" 2> /dev/null || echo "route: no result")
  write_row "not run" "not run" "not run" "not run" "$name"
  exit 0
fi

# The name scenario alone (#3411), which needs no WebView: the stamp's
# other columns say so.
if [ "${NAME_ONLY:-false}" = true ]; then
  bash "$here/name-lookup.sh" "$apks" "$out/name"
  name=$(node -e 'const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(r.asked + "/" + r.past_cache)' "$out/name/name.json" 2> /dev/null || echo "fail/fail")
  write_row "not run" "not run" "not run" "not run" "$name"
  exit 0
fi

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
# (31 and 24): every entry cold, then every entry warm, each found by the
# page's title in the accessibility tree, with a screenshot.
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
  # enter <entry>: start the app by that entry. The wings are
  # MainActivity.wingRoot's aliases, named here because API 24 and 25 cannot
  # list them (no query-activities).
  enter() {
    case $1 in
      plain) adb shell am start -W -n "$pkg/.MainActivity" > /dev/null ;;
      shortcut) adb shell am start -W -a dev.paulgsc.someui.NEW_IDEA -n "$pkg/.MainActivity" > /dev/null ;;
      *) adb shell am start -W -n "$pkg/.$1" > /dev/null ;;
    esac
  }
  # Every entry cold (the app stopped first), then every entry warm (the
  # app running on the update page): OWV1's whole entry x start family.
  entries=(plain WingPractice WingSelf WingStudio WingJobs WingCast shortcut)
  for entry in "${entries[@]}"; do
    adb shell am force-stop "$pkg"
    enter "$entry"
    still_shown "$entry, cold"
  done
  adb exec-out screencap -p > "$out/launch/old-webview.png" || true
  for entry in "${entries[@]}"; do
    enter "$entry"
    still_shown "$entry, warm"
  done
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
