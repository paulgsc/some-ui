#!/usr/bin/env bash
# The release APK's launch test, run by mobile-apk.yml's `launch` job inside a
# booted emulator (reactivecircus/android-emulator-runner): install it, start
# it, let it settle, then drive it with a short seeded monkey run.
#
#   bash apps/mobile/launch/launch-test.sh <apk> [<out-dir>]
#
# Fails on what a person would see as "the app is broken": the process gone
# after launch, a Java crash, or an ANR, in the app's own process; and on a
# monkey run that did not finish, which would otherwise pass having driven
# nothing. <out-dir> gets two screenshots, the monkey log and logcat, which
# the job uploads.
#
# It also fails when the app's database did not open, which does not crash:
# the app's native log (tag "SomeUI", NativeLogPlugin.java) must say "device
# storage: opened" and carry no "foreign-failure [device storage]" line.
# Other reported failures (no speech recognizer, say) are listed, not failed.
#
# What it cannot see is a WebView that starts and stays blank: that does not
# crash. Only the screenshot shows the page rendered. Two signals that looked
# like they would were tried on the first run (2026-09-30) and read nothing:
# `uiautomator dump` exposes no WebView text, and Capacitor forwards console
# output to logcat only in debug builds (`loggingBehavior` defaults to
# "debug"), so a release build's console errors never reach it. The native
# log does.
#
# logcat is streamed, not dumped at the end: the emulator's 2 MB ring buffer
# fills with system noise in seconds, and a dump after the monkey run no
# longer held the app's first lines.
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
adb logcat > "$out/logcat.txt" 2>&1 &
logcat_pid=$!
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

# A short random walk inside the app. System keys are off so it does not
# leave for the home screen; the seed keeps a failure reproducible.
adb shell monkey -p "$pkg" --pct-syskeys 0 --throttle 250 -s 42 -v 300 \
  > "$out/monkey.txt" 2>&1 || true
adb exec-out screencap -p > "$out/after-monkey.png" || true
kill "$logcat_pid" 2>/dev/null || true
wait "$logcat_pid" || true

if ! grep -q "// Monkey finished" "$out/monkey.txt"; then
  failures+=("the monkey run did not finish (monkey.txt)")
fi
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

# The app's own log (apps/www src/lib/native-log): its database, and what
# it reported failing.
grep -E "\bSomeUI\b" "$out/logcat.txt" > "$out/native-log.txt" || true
if grep -q "foreign-failure \[device storage\]" "$out/native-log.txt"; then
  failures+=("the app's database reported a failure: $(grep -m1 "foreign-failure \[device storage\]" "$out/native-log.txt" | sed 's/.*foreign-failure/foreign-failure/') (native-log.txt)")
fi
if ! grep -q "device storage: opened" "$out/native-log.txt"; then
  failures+=("the app's database never opened: no \"device storage: opened\" in its native log (native-log.txt)")
fi
reported=$(grep -c "foreign-failure" "$out/native-log.txt" || true)

events=$(grep -oE "Events injected: [0-9]+" "$out/monkey.txt" | grep -oE "[0-9]+$" || echo 0)

{
  echo "## Launch test"
  echo
  echo "- Release APK: \`$(basename "$apk")\`, installed and started on the emulator."
  echo "- Monkey events injected: **$events**."
  echo "- Failures the app reported to its native log: **$reported** (native-log.txt)."
  grep -o "foreign-failure.*" "$out/native-log.txt" | sort | uniq -c | head -5 | sed 's/^ */  - /' || true
  if [ ${#failures[@]} -eq 0 ]; then
    echo "- No crash, ANR or dead process, and the database opened."
  else
    for f in "${failures[@]}"; do echo "- ❌ $f"; done
  fi
  echo
  echo "Whether the page rendered shows only in \`launched.png\` (a blank WebView does not crash). It, \`after-monkey.png\`, monkey.txt and logcat.txt are in the \`mobile-launch-<sha>\` artifact."
} >> "$summary"

for f in "${failures[@]}"; do echo "::error title=Launch test::$f"; done
[ ${#failures[@]} -eq 0 ]
