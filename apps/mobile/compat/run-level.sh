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
webview=${webview:-unknown}

# The bundle's floor: Vite's default target (baseline-widely-available),
# about Chrome 111. Below it the page loads blank, which on a real phone
# cannot happen once Play has updated Android System WebView (Android 7
# takes up to about 119), so such a level is not tested and its row says
# why rather than reading red.
MIN_WEBVIEW=111
major=${webview%%.*}
if [[ "$major" =~ ^[0-9]+$ ]] && [ "$major" -lt "$MIN_WEBVIEW" ]; then
  why="stock WebView $major (needs ≥$MIN_WEBVIEW)"
  write_row "$why" "$why" "$why" "$why"
  echo "::notice title=API $api::$why: the image's WebView is older than the bundle needs; a phone updated from Play is not. Not tested."
  exit 0
fi

launch=fail
GITHUB_STEP_SUMMARY=${GITHUB_STEP_SUMMARY:-/dev/null} \
  bash "$here/../launch/launch-test.sh" "$apks/launch.apk" "$out/launch" && launch=pass

# The stand-in home's certificate, from a CA made for this level and
# trusted by nothing else.
certs=$(mktemp -d)
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=android-compat CA" \
  -keyout "$certs/ca.key" -out "$certs/ca.pem" \
  -addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign > /dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -subj "/CN=10.0.2.2" \
  -keyout "$certs/home.key" -out "$certs/home.csr" > /dev/null 2>&1
printf 'subjectAltName=IP:10.0.2.2\nextendedKeyUsage=serverAuth\n' > "$certs/ext"
openssl x509 -req -in "$certs/home.csr" -CA "$certs/ca.pem" -CAkey "$certs/ca.key" \
  -CAcreateserial -days 1 -extfile "$certs/ext" -out "$certs/home.pem" > /dev/null 2>&1

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
