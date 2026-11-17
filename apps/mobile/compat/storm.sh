#!/usr/bin/env bash
# The storm scenario (COMPAT2), run by android-compat.yml inside a booted,
# slowed emulator after the launch test: the debug APK paired with a
# stand-in home on the runner (stub-home.mjs, reached at
# https://10.0.2.2:8787), then pulled down, pulled in bursts, pulled while
# home is busy, sent to the background and back, and cut off the network and
# given it back. Fails when home hears more than the budget
# (budget.json, HERD1's numbers) or when a pull does not refresh the page.
#
#   COMPAT_CERTS=<dir> bash apps/mobile/compat/storm.sh <debug-apk> <out-dir>
#
# <dir> holds ca.pem, home.pem and home.key (run-level.sh makes them). The
# phone pairs only over https, so the CA goes into the emulator's system
# store (trust-ca.sh) and the app stays as shipped. Where that fails, the
# level runs the same phases against the unpaired sync's plain-http address
# instead, and storm.json says `paired: "no"`.
#
# Writes <out-dir>/storm.json (each phase's request count and how its pulls
# ended), stub.json (every request home heard), the native log and
# screenshots; android-compat.yml reads storm.json into the stamp.
#
# Why the debug APK: its page can be read over the WebView's DevTools socket
# (page.mjs), which a release build closes. Its JavaScript is the release
# APK's byte for byte (R8 shrinks only the Java), and the storm is the
# page's. The launch test before this covers the release build itself.
#
# A pull "refreshes" when the native log gets a `pull checked: read` line for
# it (lib/pull-refresh's `note` port, as launch-test.sh reads it). Sample
# data only: the stub answers fixtures and holds nothing personal.
set -euo pipefail

apk=$1
out=${2:-storm-out}
here=$(cd "$(dirname "$0")" && pwd)
pkg=dev.paulgsc.someui
control=http://127.0.0.1:8788
budget="$here/budget.json"
mkdir -p "$out"
: > "$out/failures.txt"
: > "$out/refresh.txt"
phases=()
# Files, not arrays: phases run their gestures in a subshell. A request over
# budget is the storm column's; a page that did not refresh or recover is
# the refresh column's.
fail() { echo "$1" >> "$out/failures.txt"; }
fail_refresh() { echo "$1" >> "$out/refresh.txt"; }

# The stand-in home, over https with the run's certificate when run-level.sh
# made one and trust-ca.sh got its CA into the system store: a paired phone
# reaches home only over https (LA8).
paired=no
stub_tls=()
if [ -n "${COMPAT_CERTS:-}" ] && bash "$here/trust-ca.sh" "$COMPAT_CERTS/ca.pem" > "$out/trust-ca.log" 2>&1; then
  paired=trusted
  stub_tls=(--cert "$COMPAT_CERTS/home.pem" --key "$COMPAT_CERTS/home.key")
else
  echo "::warning title=Storm::the run's CA could not be put in this level's system store (trust-ca.log); the paired flow is not run here"
fi
node "$here/stub-home.mjs" --port 8787 --control 8788 "${stub_tls[@]}" > "$out/stub.log" 2>&1 &
stub_pid=$!
trap 'kill "$stub_pid" 2>/dev/null || true; kill "${logcat_pid:-0}" 2>/dev/null || true' EXIT
for _ in $(seq 1 20); do
  curl -sf "$control/counts" > /dev/null && break
  sleep 0.5
done

adb uninstall "$pkg" > /dev/null 2>&1 || true
adb install -r "$apk" > /dev/null
adb logcat -c
adb logcat > "$out/logcat.txt" 2>&1 &
logcat_pid=$!

native_count() { grep -cE "\bSomeUI\b.*$1" "$out/logcat.txt" || true; }
native_line() {
  for _ in $(seq 1 "${2:-30}"); do
    grep -qE "\bSomeUI\b.*$1" "$out/logcat.txt" && return 0
    sleep 1
  done
  return 1
}
page() { node "$here/page.mjs" "$1"; }
budget_of() { node -e "console.log(require('$budget')$1)"; }
requests() { curl -sf "$control/counts" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).total))'; }

adb shell am start -W -n "$pkg/.WingPractice" > /dev/null
if ! native_line "device storage: opened" 60; then
  fail "the debug APK's database never opened"
fi

if [ "$paired" = trusted ]; then
  # Paired as a person pairs: the front desk's Pair form, filled and pressed
  # through the page (the sample code is any well-formed one; the stub
  # answers it with a sample token). Then back to the wing.
  page "location.href = '/settings'; true" > /dev/null || true
  sleep 8
  paired=$(page "(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const until = async (find, ms = 30000) => {
      for (const end = Date.now() + ms; Date.now() < end; await wait(250)) {
        const found = find()
        if (found) return found
      }
      return null
    }
    const button = (label) => [...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim().startsWith(label) && !b.disabled)
    const type = (input, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const open = await until(() => button('Pair...'))
    if (!open) return 'no Pair button'
    open.click()
    const address = await until(() => document.getElementById('pair-address'))
    type(address, 'https://10.0.2.2:8787')
    type(document.getElementById('pair-code'), 'K7QF2M9X')
    const go = await until(() => button('Pair with'))
    if (!go) return 'Pair never enabled'
    go.click()
    if (await until(() => button('Unpair'))) return 'paired'
    const said = [...document.querySelectorAll('[role=alert], [role=status]')].map((n) => n.textContent.trim()).filter(Boolean)
    return 'not paired: ' + (said.join(' / ') || 'no answer')
  })()" 2> "$out/pair-error.txt" | tr -d '"' || echo "the page could not be driven")
  adb exec-out screencap -p > "$out/paired.png" || true
  if [ "$paired" != paired ]; then
    fail "pairing with the stand-in home failed: $paired"
  fi
  adb shell am start -W -n "$pkg/.WingPractice" > /dev/null
else
  # No trusted https on this level: the unpaired sync's address only, which
  # is plain http and reaches what home publishes without a pairing.
  page "localStorage.setItem('some-ui.device.home-server.v1', 'http://10.0.2.2:8787'); location.reload(); true" > /dev/null || true
fi
sleep 10

size=$(adb shell wm size | tr -d '\r' | grep -oE "[0-9]+x[0-9]+" | tail -1 || true)
size=${size:-1080x1920}
width=${size%x*}
height=${size#*x}
pull_down() {
  adb shell input swipe $((width / 2)) $((height * 30 / 100)) \
    $((width / 2)) $((height * 75 / 100)) 600
}

# How the newest pull ended, waiting up to 40 s for one more line than
# `before` (the pull's own deadline is 20 s; a slowed emulator needs more).
pull_end() {
  local before=$1
  for _ in $(seq 1 40); do
    if [ "$(native_count "pull checked: [a-z]+")" -gt "$before" ]; then
      grep -oE "\bSomeUI\b.*pull checked: [a-z]+" "$out/logcat.txt" | tail -1 | grep -oE "[a-z]+$"
      return 0
    fi
    sleep 1
  done
  echo none
}

# One phase: reset home's count, run its gestures, let it settle, record.
# $1 name, $2 the budget's key for its limit (or "" for none), then the
# command that drives it. Prints nothing; appends to phases.
phase() {
  local name=$1 limit_key=$2
  shift 2
  curl -sf -X POST "$control/reset" > /dev/null
  local before
  before=$(native_count "pull checked: [a-z]+")
  local ends
  ends=$("$@" || echo error)
  sleep "$(budget_of .settleSeconds)"
  local heard
  heard=$(requests)
  local limit=null
  if [ -n "$limit_key" ]; then
    limit=$(budget_of ".$limit_key")
    if [ "$heard" -gt "$limit" ]; then
      fail "$name: home heard $heard requests, over the budget of $limit (stub.json)"
    fi
  fi
  curl -sf "$control/counts" > "$out/stub-$name.json"
  adb exec-out screencap -p > "$out/$name.png" || true
  phases+=("{\"phase\":\"$name\",\"requests\":$heard,\"limit\":$limit,\"pulls\":\"$ends\",\"newEnds\":$(($(native_count "pull checked: [a-z]+") - before))}")
}

one_pull() {
  local before
  before=$(native_count "pull checked: [a-z]+")
  pull_down
  pull_end "$before"
}

burst() {
  local n
  n=$(budget_of .burst.pulls)
  local gap
  gap=$(budget_of .burst.gapSeconds)
  for _ in $(seq 1 "$n"); do
    pull_down
    sleep "$gap"
  done
  echo "burst of $n"
}

busy() {
  local seconds
  seconds=$(budget_of .busy.retryAfterSeconds)
  curl -sf -X POST "$control/busy?seconds=$seconds" > /dev/null
  local before
  before=$(native_count "pull checked: [a-z]+")
  pull_down
  sleep 3
  pull_down
  pull_down
  local end
  end=$(pull_end "$before")
  sleep "$seconds"
  curl -sf -X POST "$control/calm" > /dev/null
  echo "$end"
}

background() {
  adb shell input keyevent 3
  sleep 15
  adb shell am start -W -n "$pkg/.WingPractice" > /dev/null
  sleep 5
  one_pull
}

offline() {
  local pid_before
  pid_before=$(adb shell pidof "$pkg" | tr -d '\r')
  adb shell svc wifi disable || true
  adb shell svc data disable || true
  sleep 5
  local cut
  cut=$(one_pull)
  adb shell svc wifi enable || true
  adb shell svc data enable || true
  sleep 15
  local back
  back=$(one_pull)
  if [ "$(adb shell pidof "$pkg" | tr -d '\r')" != "$pid_before" ]; then
    fail_refresh "offline: the app's process changed across the network toggle (it restarted)"
  fi
  if [ "$back" != "read" ]; then
    fail_refresh "offline: a pull after the network returned ended \"$back\", not \"read\": the page did not recover without a restart"
  fi
  echo "cut:$cut back:$back"
}

phase single pullOnce one_pull
first_end=$(echo "${phases[-1]}" | grep -oE '"pulls":"[a-z]+"' | grep -oE '[a-z]+"$' | tr -d '"')
if [ "$first_end" != "read" ]; then
  fail_refresh "single: a pull with home up ended \"$first_end\", not \"read\": the page did not refresh"
fi
phase burst burstTotal burst
phase busy busy.duringRetryAfter busy
phase background pullOnce background
phase offline offlineAndBack offline

kill "$logcat_pid" 2>/dev/null || true
grep -E "\bSomeUI\b" "$out/logcat.txt" > "$out/native-log.txt" || true

heard_any=$(cat "$out"/stub-*.json | grep -oE '"total":[0-9]+' | grep -oE '[0-9]+' | awk '{ n += $1 } END { print n + 0 }')
if [ "$heard_any" -eq 0 ]; then
  fail "home heard no request in any phase: the storm was not exercised (is the address set where a pull reads it?)"
fi

node -e '
const fs = require("fs")
const [phases, storm, refresh, file, paired] = process.argv.slice(1)
const lines = (f) => fs.readFileSync(f, "utf8").split("\n").filter(Boolean)
fs.writeFileSync(
  file,
  JSON.stringify(
    {
      paired,
      phases: JSON.parse(phases),
      storm: lines(storm),
      refresh: lines(refresh),
    },
    null,
    2
  )
)
' "[$(IFS=,; echo "${phases[*]}")]" "$out/failures.txt" "$out/refresh.txt" "$out/storm.json" "$paired"

while IFS= read -r f; do echo "::error title=Storm::$f"; done < "$out/failures.txt"
while IFS= read -r f; do echo "::error title=Refresh::$f"; done < "$out/refresh.txt"
[ ! -s "$out/failures.txt" ] && [ ! -s "$out/refresh.txt" ]
