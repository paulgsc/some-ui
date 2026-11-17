#!/usr/bin/env bash
# The storm scenario (COMPAT2), run by android-compat.yml inside a booted,
# slowed emulator after the launch test: the release APK paired with a
# stand-in home on the runner (stub-home.mjs, reached at
# https://10.0.2.2:8787), then pulled down, pulled in bursts, pulled while
# home is busy, sent to the background and back, and cut off the network and
# given it back. Fails when home hears more than the budget
# (budget.json, HERD1's numbers) or when a pull does not refresh the page.
#
#   COMPAT_CERTS=<dir> bash apps/mobile/compat/storm.sh <release-apk> <debug-apk> <out-dir>
#
# <dir> holds ca.pem, home.pem and home.key (run-level.sh makes them). The
# phone pairs only over https, so the CA goes into the emulator's system
# store (trust-ca.sh) and the app stays as shipped. Where that fails, the
# level runs the same phases against the unpaired sync's plain-http address
# instead, and storm.json says `paired: "no"`.
#
# The release APK (R8, console stripped) is what the stamp is about, so it
# pairs through the UI as a person would: the foyer's Settings, Pair..., the
# address and a sample code typed into the form (ui.mjs, over the
# accessibility tree). Only if that cannot be driven on a level does it fall
# back to the debug APK, filled over DevTools (page.mjs), and storm.json then
# says `paired: "debug"`, which the stamp shows as "paired via debug build".
#
# Writes <out-dir>/storm.json (how it paired, each phase's request count and
# how its pulls ended), stub-<phase>.json (every request home heard), the
# native log and screenshots; android-compat.yml reads storm.json into the
# stamp.
#
# A pull "refreshes" when the native log gets a `pull checked: read` line for
# it (lib/pull-refresh's `note` port, as launch-test.sh reads it). Sample
# data only: the stub answers fixtures and holds nothing personal.
set -euo pipefail

release_apk=$1
debug_apk=$2
out=${3:-storm-out}
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

adb logcat -c
adb logcat > "$out/logcat.txt" 2>&1 &
logcat_pid=$!

page() { node "$here/page.mjs" "$1"; }
budget_of() { node -e "console.log(require('$budget')$1)"; }

# install, ui, hide_keyboard and pair_by_ui, shared with other workflows
# that drive the app on an emulator; it sources native-log.sh (native_line,
# native_count, last_pull_end, pull_down and $PULL_CHECKED, shared with the
# launch test).
# shellcheck source=apps/mobile/compat/pair-ui.sh
source "$here/pair-ui.sh"

# The same through the debug APK's page, for a level where the UI cannot be
# driven.
pair_by_page() {
  page "location.href = '/settings/home'; true" > /dev/null || return 1
  sleep 8
  local said
  said=$(page "(async () => {
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
  echo "$said" > "$out/pair-debug.txt"
  [ "$said" = paired ]
}

how=no
if [ "$paired" = trusted ]; then
  how=failed
  if install "$release_apk" && pair_by_ui; then
    how=paired
  else
    adb exec-out screencap -p > "$out/pair-ui-failed.png" || true
    cp ui-last.xml "$out/pair-ui-last.xml" 2>/dev/null || true
    echo "::warning title=Storm::the release APK's Pair form could not be driven on this level (pair-ui-failed.png, pair-ui-last.xml); pairing the debug APK instead"
    if install "$debug_apk" && pair_by_page; then
      how=debug
    fi
  fi
  adb exec-out screencap -p > "$out/paired.png" || true
  if [ "$how" = failed ]; then
    fail "pairing with the stand-in home failed on the release APK and the debug APK (pair-debug.txt, pair-ui-failed.png)"
  fi
else
  # No trusted https on this level: the unpaired sync's address, typed into
  # the front desk's Home server field, which is plain http and reaches
  # what home publishes without a pairing.
  if install "$release_apk"; then
    ui tap 'Settings' &&
    ui tap 'Home' &&
      ui type 'home-server|192.168.1.10:3000' '10.0.2.2:8787' &&
      hide_keyboard &&
      ui tap 'Sync lessons from home' ||
      fail "the release APK's Home server field could not be driven (ui-errors.txt)"
  else
    fail "the release APK's database never opened"
  fi
fi
paired=$how
adb shell am start -W -n "$pkg/.WingPractice" > /dev/null
sleep 10

# How the newest pull ended, waiting up to 40 s for one more line than
# `before` (the pull's own deadline is 20 s; a slowed emulator needs more).
pull_end() {
  local before=$1
  for _ in $(seq 1 40); do
    if [ "$(native_count "$PULL_CHECKED")" -gt "$before" ]; then
      last_pull_end
      return 0
    fi
    sleep 1
  done
  echo none
}

# One phase: reset home's per-phase count, run its gestures, let it settle,
# record what home heard and how the pulls ended. $1 name, then the command
# that drives it. The budget is checked once, over the whole run, after the
# last phase (check-budget.mjs). Prints nothing; appends to phases.
phase() {
  local name=$1
  shift
  curl -sf -X POST "$control/reset" > /dev/null
  local before
  before=$(native_count "$PULL_CHECKED")
  local ends
  ends=$("$@" || echo error)
  sleep "$(budget_of .settleSeconds)"
  curl -sf "$control/counts" > "$out/stub-$name.json"
  local heard
  heard=$(node -e 'console.log(require(require("path").resolve(process.argv[1])).total)' "$out/stub-$name.json")
  adb exec-out screencap -p > "$out/$name.png" || true
  phases+=("{\"phase\":\"$name\",\"requests\":$heard,\"pulls\":\"$ends\",\"newEnds\":$(($(native_count "$PULL_CHECKED") - before))}")
}

# One pull, and how it ended. A drag the wing's own navigation landed on
# ends silently, so one that ends "none" is tried once more, as
# launch-test.sh does.
one_pull() {
  local before end
  for _ in 1 2; do
    before=$(native_count "$PULL_CHECKED")
    pull_down
    end=$(pull_end "$before")
    [ "$end" = none ] || break
  done
  echo "$end"
}

burst() {
  local n
  n=$(budget_of .burstPulls.pulls)
  local gap
  gap=$(budget_of .burstPulls.gapSeconds)
  for _ in $(seq 1 "$n"); do
    pull_down
    sleep "$gap"
  done
  echo "burst of $n"
}

busy() {
  local seconds
  seconds=$(budget_of .afterBusy.retryAfterSeconds)
  curl -sf -X POST "$control/busy?seconds=$seconds" > /dev/null
  local before
  before=$(native_count "$PULL_CHECKED")
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

# Two pulls a second apart, which HERD1 joins into one run: home must hear
# no more than from the single pull before it.
two_pulls() {
  local before
  before=$(native_count "$PULL_CHECKED")
  pull_down
  sleep 1
  pull_down
  pull_end "$before"
}

background() {
  adb shell input keyevent 3
  sleep 15
  adb shell am start -W -n "$pkg/.WingPractice" > /dev/null
  sleep 5
  local end
  end=$(one_pull)
  if [ "$end" != "read" ]; then
    fail_refresh "background: a pull after coming back from the background ended \"$end\", not \"read\": the page did not refresh"
  fi
  echo "$end"
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

phase single one_pull
first_end=$(echo "${phases[-1]}" | grep -oE '"pulls":"[a-z]+"' | grep -oE '[a-z]+"$' | tr -d '"')
if [ "$first_end" != "read" ]; then
  fail_refresh "single: a pull with home up ended \"$first_end\", not \"read\": the page did not refresh"
fi
phase joined two_pulls
single_heard=$(echo "${phases[0]}" | grep -oE '"requests":[0-9]+' | grep -oE '[0-9]+$')
joined_heard=$(echo "${phases[-1]}" | grep -oE '"requests":[0-9]+' | grep -oE '[0-9]+$')
if [ "$joined_heard" -gt "$single_heard" ]; then
  fail "joined: two pulls 1 s apart sent $joined_heard requests, more than one pull alone ($single_heard); HERD1 joins a pull to the run under way (stub-joined.json)"
fi
phase burst burst
phase busy busy
phase background background
phase offline offline

kill "$logcat_pid" 2>/dev/null || true
grep -E "\bSomeUI\b" "$out/logcat.txt" > "$out/native-log.txt" || true

# HERD1's budget over everything home heard in the run.
curl -sf "$control/all" > "$out/stub-all.json"
# The checker prints one line per breach and exits non-zero; one that exits
# non-zero having printed none could not check (a crash, a bad log).
checked=0
node "$here/check-budget.mjs" "$out/stub-all.json" "$budget" > "$out/breaches.txt" || checked=$?
while IFS= read -r breach; do
  [ -n "$breach" ] && fail "$breach (stub-all.json)"
done < "$out/breaches.txt"
if [ "$checked" -ne 0 ] && [ ! -s "$out/breaches.txt" ]; then
  fail "the budget could not be checked: check-budget.mjs exited $checked (stub-all.json)"
fi

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
