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
# The row, <out-dir>/row.json: {api, launch, paired, storm, refresh}, each
# "pass", "fail" or "not run" (paired also "no system CA", where the storm
# ran unpaired), which the stamp job tabulates.
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
COMPAT_CERTS=$certs bash "$here/storm.sh" "$apks/debug.apk" "$out/storm"
if [ -f "$out/storm/storm.json" ]; then
  read -r paired storm refresh < <(node -e '
const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
const paired = r.paired === "paired" ? "pass" : r.paired === "no" ? "no-system-CA" : "fail"
console.log(paired, r.storm.length ? "fail" : "pass", r.refresh.length ? "fail" : "pass")
' "$out/storm/storm.json")
  [ "$paired" = no-system-CA ] && paired="no system CA"
fi

node -e '
const [api, launch, paired, storm, refresh, file] = process.argv.slice(1)
require("fs").writeFileSync(file, JSON.stringify({ api: Number(api), launch, paired, storm, refresh }))
' "$api" "$launch" "$paired" "$storm" "$refresh" "$out/row.json"
cat "$out/row.json"

# A level with no system CA ran the storm unpaired: said in the row, not
# failed.
[ "$launch" = pass ] && [ "$paired" != fail ] && [ "$storm" = pass ] && [ "$refresh" = pass ]
