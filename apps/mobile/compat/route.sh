#!/usr/bin/env bash
# The route scenario (#3411, NA2), inside a booted emulator with Wi-Fi and
# mobile data: home's stand-in (a plain page on the runner, the emulator's
# 10.0.2.2:8080) asked from three set-ups of the phone's networks, each by
# HomeRouteTest's two methods (the app's way as it stands, and with the
# fix's way after it).
#
#   bash apps/mobile/compat/route.sh <apk-dir> <out-dir>
#
# - s26: as the S26 is. Wi-Fi and mobile data both work; Wi-Fi is the
#   default, as Android makes a working Wi-Fi.
# - s21: as the S21 Ultra's log shows it (failed to connect to home "from
#   /100.x", a carrier's address, at home): this app's traffic on mobile
#   data while home answers only on Wi-Fi. Wi-Fi is made to fail Android's
#   internet check (its web traffic refused, home's still let through), so
#   Android keeps mobile data the default; home is refused on mobile data,
#   as a carrier's network can't reach a home address.
# - kept-off: this app kept off Wi-Fi, mobile data off, as a per-app
#   setting would (One UI's "Mobile data only apps"). Emulated with an
#   iptables rule on the app's user id: Android itself does not know of it,
#   so it can't say the app is held. That is the nearest an emulator comes.
#
# - saver: Data Saver on with the Wi-Fi marked metered and mobile data on,
#   as the S21 had it (cmd netpolicy). Data Saver holds back an app's
#   traffic only while it is in the background, and an instrumentation run
#   may count as background, so this set-up says how the run was judged as
#   much as how the phone is.
#
# Needs root (google_apis images give it). Writes <out-dir>/route.json:
# {s26, s21, keptoff, saver}, each {as_is, fixed} "pass"/"fail", or "setup failed"
# when the emulator could not be put in that state; plus each run's output
# and the native log.
set -uo pipefail

apks=$1
out=$2
pkg=dev.paulgsc.someui
url=http://10.0.2.2:8080/
mkdir -p "$out"

adb root > /dev/null 2>&1 || true
adb wait-for-device
adb install -r "$apks/debug.apk" > /dev/null
adb install -r "$apks/tests.apk" > /dev/null
uid=$(adb shell pm list packages -U "$pkg" | tr -d '\r' | grep -oE 'uid:[0-9]+' | cut -d: -f2 | head -1)

sh_() { adb shell "$@" | tr -d '\r'; }
# The default network's kind, as Android names it: WIFI, CELLULAR or none.
default_kind() {
  sh_ dumpsys connectivity | grep -m1 -A3 'Active default network' | grep -oE 'WIFI|CELLULAR' | head -1 || true
}
reset() {
  sh_ iptables -F OUTPUT > /dev/null 2>&1 || true
  sh_ cmd netpolicy set restrict-background false > /dev/null 2>&1 || true
  sh_ cmd netpolicy set metered-network AndroidWifi false > /dev/null 2>&1 || true
  sh_ svc data enable
  sh_ svc wifi enable
  for _ in $(seq 1 30); do [ "$(default_kind)" = WIFI ] && break; sleep 2; done
}
# The interface mobile data goes out on: any with an address but lo and wlan0.
cell_if() {
  sh_ ip -o -4 addr | awk '$2 != "lo" && $2 != "wlan0" {print $2}' | head -1
}
# result <setup> <method>: "pass" or "fail", its output kept.
result() {
  sh_ am instrument -w -r -e class "$pkg.HomeRouteTest#$2" -e url "$url" \
    "$pkg.test/androidx.test.runner.AndroidJUnitRunner" > "$out/$1-$2.txt"
  if grep -q 'OK (1 test)' "$out/$1-$2.txt"; then echo pass; else echo fail; fi
}
both() {
  printf '{"as_is":"%s","fixed":"%s"}' "$(result "$1" theDefaultWayReachesHome)" "$(result "$1" someWayReachesHome)"
}
setup_failed='{"as_is":"setup failed","fixed":"setup failed"}'

adb logcat -c
sh_ ip -o -4 addr > "$out/interfaces.txt"

# s26: Wi-Fi the default.
reset
if [ "$(default_kind)" = WIFI ]; then s26=$(both s26); else s26=$setup_failed; fi
sh_ dumpsys connectivity | grep -A3 'Active default network' > "$out/s26-default.txt" || true

# s21: mobile data the default, home only on Wi-Fi.
reset
cell=$(cell_if)
echo "mobile data interface: ${cell:-none}" > "$out/s21-setup.txt"
if [ -n "$cell" ]; then
  sh_ iptables -I OUTPUT -o "$cell" -d 10.0.2.2 -p tcp --dport 8080 -j REJECT
  sh_ iptables -I OUTPUT -o wlan0 -p tcp -m multiport --dports 80,443 ! -d 10.0.2.2 -j REJECT
  sh_ svc wifi disable
  sleep 3
  sh_ svc wifi enable
  for _ in $(seq 1 45); do [ "$(default_kind)" = CELLULAR ] && sh_ dumpsys connectivity | grep -q 'WIFI.*' && break; sleep 2; done
  sleep 10
  sh_ dumpsys connectivity | grep -A3 'Active default network' >> "$out/s21-setup.txt" || true
fi
if [ -n "$cell" ] && [ "$(default_kind)" = CELLULAR ]; then s21=$(both s21); else s21=$setup_failed; fi

# kept-off: this app refused on Wi-Fi, mobile data off.
reset
if [ -n "$uid" ]; then
  sh_ iptables -I OUTPUT -o wlan0 -m owner --uid-owner "$uid" -j REJECT
  sh_ svc data disable
  sleep 5
  keptoff=$(both keptoff)
else
  keptoff=$setup_failed
fi

# saver: Data Saver on, the Wi-Fi metered.
reset
if sh_ cmd netpolicy set metered-network AndroidWifi true > "$out/saver-setup.txt" 2>&1 &&
  sh_ cmd netpolicy set restrict-background true >> "$out/saver-setup.txt" 2>&1; then
  sleep 5
  sh_ cmd netpolicy get restrict-background >> "$out/saver-setup.txt" 2>&1 || true
  saver=$(both saver)
else
  saver=$setup_failed
fi
reset

adb logcat -d -s SomeUI | tr -d '\r' > "$out/native-log.txt" || true
printf '{"s26":%s,"s21":%s,"keptoff":%s,"saver":%s}\n' "$s26" "$s21" "$keptoff" "$saver" > "$out/route.json"
cat "$out/route.json"
cat "$out/s21-setup.txt"
grep -h 'home route' "$out/native-log.txt" || true
