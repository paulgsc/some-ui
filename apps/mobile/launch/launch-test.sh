#!/usr/bin/env bash
# The release APK's launch test, run by mobile-apk.yml's `launch` job inside a
# booted emulator (reactivecircus/android-emulator-runner): install it, start
# it, let it settle, then drive it with a short seeded monkey run.
#
#   bash apps/mobile/launch/launch-test.sh <apk> [<out-dir>]
#
# Fails on what a person would see as "the app is broken": the process gone
# after launch, a Java crash, or an ANR, in the app's own process. Reports
# without failing: the WebView's console errors, and whether the sessions
# page's text reached the accessibility tree (a blank WebView does not
# crash). <out-dir> gets screenshots, the UI dump, the monkey log and logcat,
# which the job uploads.
#
# It is one script rather than the action's `script:` input because that
# input runs each line as its own shell, so no variable or `if` spans lines.
set -euo pipefail

apk=$1
out=${2:-launch-out}
pkg=dev.paulgsc.someui
mkdir -p "$out"
summary=${GITHUB_STEP_SUMMARY:-/dev/null}
failures=()

adb logcat -c
adb install -r "$apk"
adb shell monkey -p "$pkg" -c android.intent.category.LAUNCHER 1 > /dev/null

# Up to 60 s for the process, then 20 s for the WebView to load the bundle
# and the device backend to open its database.
pid=""
for _ in $(seq 1 60); do
  pid=$(adb shell pidof "$pkg" | tr -d '\r' || true)
  [ -n "$pid" ] && break
  sleep 1
done
if [ -z "$pid" ]; then
  failures+=("the app's process never started")
else
  sleep 20
  if [ -z "$(adb shell pidof "$pkg" | tr -d '\r' || true)" ]; then
    failures+=("the app's process was gone 20 s after launch")
  fi
fi
adb exec-out screencap -p > "$out/launched.png" || true
adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1 &&
  adb pull /sdcard/ui.xml "$out/launched-ui.xml" > /dev/null 2>&1 || true

# A short random walk inside the app. System keys are off so it does not
# leave for the home screen; the seed keeps a failure reproducible.
adb shell monkey -p "$pkg" --pct-syskeys 0 --throttle 250 -s 42 -v 300 \
  > "$out/monkey.txt" 2>&1 || true
adb exec-out screencap -p > "$out/after-monkey.png" || true
adb logcat -d > "$out/logcat.txt"

if grep -q "// CRASH: $pkg" "$out/monkey.txt"; then
  failures+=("monkey saw a crash (monkey.txt)")
fi
if grep -q "// NOT RESPONDING: $pkg" "$out/monkey.txt"; then
  failures+=("monkey saw an ANR (monkey.txt)")
fi
if grep -A2 "FATAL EXCEPTION" "$out/logcat.txt" | grep -q "Process: $pkg"; then
  failures+=("a Java crash in $pkg (logcat.txt, FATAL EXCEPTION)")
fi
if grep -q "ANR in $pkg" "$out/logcat.txt"; then
  failures+=("an ANR in $pkg (logcat.txt)")
fi

console_errors=$(grep -cE "^E/Capacitor/Console|E Capacitor/Console" "$out/logcat.txt" || true)
if [ -f "$out/launched-ui.xml" ] && grep -q 'Sessions' "$out/launched-ui.xml"; then
  sessions_text="found"
else
  sessions_text="not found"
fi

{
  echo "## Launch test"
  echo
  echo "- Release APK: \`$(basename "$apk")\`, installed and started on the emulator."
  echo "- \"Sessions\" in the accessibility tree after launch: **$sessions_text** (report-only)."
  echo "- WebView console errors: **$console_errors** (report-only; \`logcat.txt\`, tag \`Capacitor/Console\`)."
  if [ ${#failures[@]} -eq 0 ]; then
    echo "- No crash, ANR or dead process."
  else
    for f in "${failures[@]}"; do echo "- ❌ $f"; done
  fi
  echo
  echo "Screenshots, the UI dump, monkey.txt and logcat.txt are in the \`mobile-launch-<sha>\` artifact."
} >> "$summary"

for f in "${failures[@]}"; do echo "::error title=Launch test::$f"; done
[ ${#failures[@]} -eq 0 ]
