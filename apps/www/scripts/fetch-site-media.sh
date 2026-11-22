#!/usr/bin/env bash
# The landing's media (PAGES #3401, C1059), fetched where
# render-public-site.ts looks for them (apps/www/src/landing/output.ts,
# SITE_MEDIA_DIR). One copy, run by pages.yml's "Fetch the site's media" step
# and by `pnpm --filter www preview:pages` on the owner's machine (C1111), so
# a preview shows exactly the media a deploy would.
#
# Only from this repository's own successful runs of the two producers on
# main (Site Assets on a push, a dispatch or its schedule; Snips Capture on a
# dispatch), never a pull request's or a fork's: their artifacts list beside
# main's, and a fork's branch can be named main. Of each kind, the newest
# such run's. Each archive is tested, refused whole if it holds a link, and
# unpacked apart, and only its regular files move in, so a broken download or
# a link to a file on this machine ships nothing.
#
# Best effort: a kind with none keeps its slot's drawn placeholder. The
# report says which kinds were found; in Actions it goes to the step summary.
#
# Needs: gh, signed in with read access to the repository's Actions
# (GH_TOKEN in Actions), unzip and zipinfo.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
media="$here/../node_modules/.cache/www/site-media"
repo="${GITHUB_REPOSITORY:-paulgsc/some-ui}"
report="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
if [ -n "${RUNNER_TEMP:-}" ]; then
  work="$RUNNER_TEMP/site-media"
  mkdir -p "$work"
else
  work="$(mktemp -d)"
fi

# Fetched beside the media folder and swapped in on the way out, so the
# build shows only what this fetch found, as a deploy would. A fetch that
# stops partway still gives the build what it had found, as the step always
# did; one that found nothing at all (gh signed out, no network) leaves an
# earlier local preview's media as they were.
final="$media"
media="$media.next"
swap() {
  if [ -n "$(find "$media" -type f -print -quit 2>/dev/null)" ]; then
    rm -rf "$final"
    mv "$media" "$final"
  else
    rm -rf "$media"
    mkdir -p "$final"
  fi
  if [ -z "${RUNNER_TEMP:-}" ]; then rm -rf "$work"; fi
}
trap swap EXIT
rm -rf "$media"
mkdir -p "$media"
: > "$work/seen"
for producer in site-assets.yml:push,workflow_dispatch,schedule snips-capture.yml:workflow_dispatch; do
  workflow="${producer%%:*}"
  events="${producer#*:}"
  gh api "repos/$repo/actions/workflows/$workflow/runs?branch=main&status=success&per_page=20" \
    --jq ".workflow_runs[]
          | select(.head_repository.id == .repository.id)
          | select(.head_branch == \"main\")
          | select(.event as \$e | any(\"$events\" | split(\",\")[]; . == \$e))
          | .id" |
  while read -r run; do
    gh api "repos/$repo/actions/runs/$run/artifacts" \
      --jq '.artifacts[]
            | select(.name | startswith("site-assets-"))
            | select(.expired | not)
            | [(.name | sub("-[0-9a-f]{40}$"; "")), .id]
            | @tsv' |
    while IFS="$(printf '\t')" read -r kind id; do
      grep -qxF "$kind" "$work/seen" && continue
      zip="$work/$id.zip"
      out="$work/$id"
      # An archive holding a link is refused whole: before it is unpacked
      # when its listing shows one (unzip makes links, and one to a folder
      # could write outside $out), and after, for a host whose listing hides
      # it (VMS), when anything but files and folders came out. Each listing
      # goes to a file, not a pipe, so one cut short cannot read as "no link".
      if gh api "repos/$repo/actions/artifacts/$id/zip" > "$zip" &&
        unzip -tq "$zip" && zipinfo "$zip" > "$zip.list" &&
        ! grep -q '^l' "$zip.list" && unzip -q "$zip" -d "$out" &&
        find "$out" ! -type f ! -type d > "$zip.odd" && [ ! -s "$zip.odd" ]; then
        (cd "$out" && find . -type f) | while read -r file; do
          mkdir -p "$media/$(dirname "$file")"
          mv "$out/$file" "$media/$file"
        done
        echo "$kind" >> "$work/seen"
        echo "- $kind: run $run, artifact $id" >> "$report"
      else
        echo "- $kind: artifact $id did not unpack; its slot keeps its placeholder" >> "$report"
      fi
    done
  done
done
{
  echo "Site media found (a slot with none draws its placeholder):"
  (cd "$media" && find . -type f | sort)
} >> "$report"
