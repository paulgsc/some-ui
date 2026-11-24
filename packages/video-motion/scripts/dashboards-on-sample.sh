#!/usr/bin/env bash
# The server's dashboards, drawn on sample telemetry (the owner on #3401,
# 2026-11-23): compiled from paulgsc/server's jsonnet by the dashboard-builder
# image its release pins, as server CI's "Build the dashboards as home does"
# step runs it; served by a throwaway Grafana over a throwaway Prometheus that
# holds one week of sample telemetry (src/walk/dashboard-telemetry.ts); walked
# (`home-server`, `home-cores`, and `home-call` and `home-pipelines` for an
# essay, #3476). Grafana and Prometheus are the images the same
# release pins. Nothing reaches home, and no key is used: Grafana lets an
# anonymous Viewer read, and is reachable only from this machine.
#
#   scripts/dashboards-on-sample.sh <server checkout> <out folder> [<walk> …]
#
# Walks the landing's three (`home-server`, `home-server-rows`,
# `home-cores`) unless walks are named. Writes <out>/walk-<app> for each (a walk's
# snips and walk.json). Needs docker, jq and the walk's Chromium. Run from
# this package's folder (the workflow and `pnpm exec` both do).
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: scripts/dashboards-on-sample.sh <server checkout> <out folder> [<walk> …]" >&2
  exit 2
fi
apps=("${@:3}")
if [ ${#apps[@]} -eq 0 ]; then
  apps=(home-server home-server-rows home-cores)
fi
server=$(cd "$1" && pwd)
mkdir -p "$2"
out=$(cd "$2" && pwd)
release="$server/deploy/home/release.json"
image() { jq -er --arg s "$1" '.services[$s].image' "$release"; }
builder=$(image dashboard-builder)
prometheus=$(image prometheus)
grafana=$(image grafana)
# The server commit the dashboards are built from: the walk names what it shows.
version="0.0.0+$(git -C "$server" rev-parse --short=12 HEAD)"

work=$(mktemp -d)
net="dashboards-on-sample-$$"
cleanup() {
  docker rm -f "$net-grafana" "$net-prometheus" > /dev/null 2>&1 || true
  docker network rm "$net" > /dev/null 2>&1 || true
  # Prometheus wrote its blocks as its own user, which this one cannot
  # remove: remove them as root through a container first. Nothing in the
  # cleanup fails the run, so a run that drew its pictures keeps them.
  docker run --rm --user 0 -v "$work:/work" --entrypoint sh "$prometheus" -c 'rm -rf /work/*' > /dev/null 2>&1 || true
  rm -rf "$work" 2> /dev/null || true
}
trap cleanup EXIT

# 1. The dashboards, as home builds them (no network: the sources are all here).
mkdir -p "$work/generated"
chmod 777 "$work/generated"
docker run --rm --network none \
  -v "$server/infra/grafana/dashboards:/workspace:ro" \
  -v "$work/generated:/generated" "$builder"

# 2. The week of sample telemetry, and the walks' sample naming it. Grafana's
# port is chosen when it starts (step 4), so the sample is written for a
# placeholder origin here and given the real one there.
pnpm -s motion dashboards-sample "$work/sample" --origin http://127.0.0.1:1 --version "$version"

# 3. Prometheus' blocks from it, then Prometheus over them, with nothing to
# scrape. Its retention outlasts the week however old it is: retention is
# counted back from the newest block, never from today.
mkdir -p "$work/tsdb"
chmod 777 "$work/tsdb"
docker run --rm --network none --entrypoint promtool \
  -v "$work/sample:/sample:ro" -v "$work/tsdb:/tsdb" "$prometheus" \
  tsdb create-blocks-from openmetrics /sample/telemetry.om /tsdb
printf 'global:\n  scrape_interval: 1m\n' > "$work/prometheus.yml"
docker network create "$net" > /dev/null
docker run -d --name "$net-prometheus" --network "$net" --network-alias prometheus \
  -v "$work/prometheus.yml:/etc/prometheus/prometheus.yml:ro" -v "$work/tsdb:/prometheus" \
  "$prometheus" --config.file=/etc/prometheus/prometheus.yml --storage.tsdb.path=/prometheus \
  --storage.tsdb.retention.time=3650d > /dev/null

# 4. Grafana with the server's own datasource (uid `prometheus`, at
# http://prometheus:9090) and dashboard provider, the compiled dashboards, and
# an anonymous Viewer. Its alert rules are left out: they would only query.
# No plugin is fetched, no update checked and nothing reported.
docker run -d --name "$net-grafana" --network "$net" -p "127.0.0.1::3000" \
  -v "$server/infra/grafana/provisioning/datasources:/etc/grafana/provisioning/datasources:ro" \
  -v "$server/infra/grafana/provisioning/dashboards:/etc/grafana/provisioning/dashboards:ro" \
  -v "$work/generated:/var/lib/grafana/dashboards:ro" \
  -e GF_AUTH_ANONYMOUS_ENABLED=true -e GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer \
  -e GF_AUTH_DISABLE_LOGIN_FORM=true -e GF_USERS_ALLOW_SIGN_UP=false \
  -e GF_PLUGINS_PREINSTALL_DISABLED=true -e GF_ANALYTICS_REPORTING_ENABLED=false \
  -e GF_ANALYTICS_CHECK_FOR_UPDATES=false -e GF_ANALYTICS_CHECK_FOR_PLUGIN_UPDATES=false \
  -e GF_NEWS_NEWS_FEED_ENABLED=false \
  "$grafana" > /dev/null
# A free port on this machine's loopback, which docker chose. None means
# Grafana already stopped: say why, with both containers' logs.
logs() {
  docker logs "$net-prometheus" 2>&1 | tail -n 40 >&2 || true
  docker logs "$net-grafana" 2>&1 | tail -n 60 >&2 || true
}
bound=$(docker port "$net-grafana" 3000/tcp 2> /dev/null | grep -m 1 '^127\.0\.0\.1:' || true)
if [ -z "$bound" ]; then
  echo "Grafana stopped before it took a port" >&2
  logs
  exit 1
fi
origin="http://$bound"
jq --arg origin "$origin" '.origin = $origin' "$work/sample/sample.json" > "$work/sample/walk.json"

# Both answer, and Grafana has loaded both dashboards, or the run stops here
# with their logs: a walk of a Grafana that never started photographs nothing.
ready() {
  docker exec "$net-prometheus" wget -T 5 -qO- http://localhost:9090/-/ready > /dev/null 2>&1 &&
    curl -fsS --max-time 5 "$origin/api/dashboards/uid/file-host-dashboard" > /dev/null 2>&1 &&
    curl -fsS --max-time 5 "$origin/api/dashboards/uid/who-dunnit-forensic" > /dev/null 2>&1 &&
    curl -fsS --max-time 5 "$origin/api/dashboards/uid/call" > /dev/null 2>&1 &&
    { [[ " ${apps[*]} " != *" home-pipelines "* ]] ||
      curl -fsS --max-time 5 "$origin/api/dashboards/uid/pipelines" > /dev/null 2>&1; }
}
for _ in $(seq 1 90); do
  ready && break
  sleep 2
done
if ! ready; then
  echo "Grafana or Prometheus did not come up in 3 minutes" >&2
  logs
  exit 1
fi

# 5. The walks: each one tried, so one that fails costs no other its
# pictures, and the run fails after the last if any did.
failed=()
for app in "${apps[@]}"; do
  rm -rf "$out/walk-$app"
  if ! pnpm -s motion walk "$app" --sample "$work/sample/walk.json" --out "$out/walk-$app"; then
    failed+=("$app")
  fi
done
if [ ${#failed[@]} -gt 0 ]; then
  echo "These walks failed: ${failed[*]}" >&2
  exit 1
fi
