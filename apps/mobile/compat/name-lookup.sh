#!/usr/bin/env bash
# The name scenario (#3411), inside a booted emulator whose resolver is
# apps/mobile/compat/staged-dns.py (android-compat.yml's `-dns-server`): the
# phone set up as the owner's S21 Ultra is, on Wi-Fi with its mobile data
# off, then the instrumentation tests of NameLookupTest. Each staged name
# fails its first lookup and answers every later one.
#
#   bash apps/mobile/compat/name-lookup.sh <apk-dir> <out-dir>
#
# <apk-dir> holds debug.apk and tests.apk. Writes <out-dir>/name.json:
# {asked, past_cache}, each "pass" or "fail":
# - asked: the app's own way to home (HttpURLConnection, as Capacitor's HTTP
#   plugin sends) finds the name once the resolver answers it. "fail" is the
#   S21's symptom: the phone keeps saying the name has no address.
# - past_cache: the same, asked again through Android's DnsResolver past its
#   cache (FLAG_NO_CACHE_LOOKUP), the candidate fix's mechanism.
# Plus the instrumentation output and the app's native log lines.
set -uo pipefail

apks=$1
out=$2
pkg=dev.paulgsc.someui
mkdir -p "$out"

# As the S21 Ultra: Wi-Fi only, no mobile network.
adb shell svc data disable || true
adb shell svc wifi enable || true
for _ in $(seq 1 30); do
  adb shell dumpsys connectivity | tr -d '\r' | grep -q 'WIFI.*VALIDATED\|type: WIFI' && break
  sleep 2
done
adb shell dumpsys connectivity | tr -d '\r' | grep -E 'NetworkAgentInfo|Active default network' > "$out/networks.txt" || true

adb install -r "$apks/debug.apk" > /dev/null
adb install -r "$apks/tests.apk" > /dev/null
adb logcat -c
# result <method>: one test method run, "pass" or "fail".
result() {
  adb shell am instrument -w -r \
    -e class "$pkg.NameLookupTest#$1" \
    -e host file-host.home.test -e fresh fresh.home.test -e port 8080 \
    "$pkg.test/androidx.test.runner.AndroidJUnitRunner" | tr -d '\r' > "$out/$1.txt"
  if grep -q 'OK (1 test)' "$out/$1.txt"; then echo pass; else echo fail; fi
}
asked=$(result aNameThatFailedOnceIsFoundOnceItAnswers)
past=$(result aLookupPastTheCacheFindsTheNameOnceItAnswers)
adb logcat -d -s SomeUI | tr -d '\r' > "$out/native-log.txt" || true
printf '{"asked":"%s","past_cache":"%s"}\n' "$asked" "$past" > "$out/name.json"
cat "$out/name.json"
grep -h 'name lookup' "$out/native-log.txt" || true
