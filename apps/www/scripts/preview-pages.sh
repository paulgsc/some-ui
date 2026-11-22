#!/usr/bin/env bash
# `pnpm --filter www preview:pages` (C1111): the public site as GitHub Pages
# would serve it from the checked-out branch, built and served on this
# machine, so the owner sees a change to it before it merges and without a
# Pages run. It does what pages.yml's build-www job does, in its order:
#
#   1. fetches the newest site media from main's own producer runs, with the
#      very script that job runs (fetch-site-media.sh);
#   2. builds www and its workspace dependencies with the Pages build's
#      environment (the `pages` profile, static data, the /some-ui/ base);
#   3. serves apps/www/dist at http://localhost:4173/some-ui/ until Ctrl-C.
#
# Needs pnpm, dependencies installed (`pnpm install`), and gh signed in to
# an account that can read this repository's Actions (`gh auth status`).
# Without gh the media step says so and the site shows every slot's drawn
# placeholder, as a deploy with no media would. Pages builds inside the
# repo's nix shell (`nix develop .#ci`); the same command runs inside or
# outside it.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
base=/some-ui/

echo "[preview:pages] fetching the site's media from main's runs"
if ! bash "$here/fetch-site-media.sh"; then
  echo "[preview:pages] the media fetch failed (is gh signed in? gh auth status); every slot without media draws its placeholder"
fi

echo "[preview:pages] building the site as Pages does"
cd "$root"
NODE_ENV=production \
  VITE_BASE_PATH="$base" \
  VITE_STATIC_DATA=true \
  SOME_UI_PROFILE=pages \
  pnpm turbo build --filter=www... --concurrency=100%

for page in index.html resume/index.html authorship/index.html 404.html; do
  test -f "apps/www/dist/$page" || {
    echo "[preview:pages] the build has no $page"
    exit 1
  }
done

echo "[preview:pages] serving the site at http://localhost:4173${base} (Ctrl-C stops it)"
cd "$root/apps/www"
VITE_BASE_PATH="$base" SOME_UI_PROFILE=pages exec pnpm exec vite preview --port 4173 --strictPort
