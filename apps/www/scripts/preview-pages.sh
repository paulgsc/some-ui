#!/usr/bin/env bash
# `pnpm --filter www preview:pages` (C1111): fetch main's site media, build
# as pages.yml's build-www does, and serve at http://localhost:4173/some-ui/.
# How to run it, and what it needs: apps/www/src/landing/README.md.
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
# The show's draft scenes (apps/www/src/landing/show.ts) are shown here, for
# the owner to read; Pages leaves them out.
NODE_ENV=production \
  SITE_SHOW_DRAFTS=1 \
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
VITE_BASE_PATH="$base" SOME_UI_PROFILE=pages exec pnpm run serve --port 4173 --strictPort
