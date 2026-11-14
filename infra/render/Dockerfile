# syntax=docker/dockerfile:1.7

# Home's render worker (`pgathondu/render`): the recorders (apps/www/tests/record),
# the recording stage they capture (apps/www/stage, `build:stage`) and the
# motion compositions (@some-ui/video-motion), all from the one commit this
# image is built from, so a recorder and its stage can never be at two
# versions (paulgsc/server#758). .github/workflows/render-docker-release.yml
# publishes it from main; paulgsc/server's infra/compose/call-render.yml runs
# it by digest, with infra/render/render-calls.sh (kept there, beside the
# folders file_host writes) as its entrypoint.
#
# Everything that decides a video's bytes is pinned, so the same episode gives
# the same video:
# - Node and Chromium: Playwright's image for the version this repo pins
#   (@playwright/test 1.62.1), by digest. Its Chromium headless shell, under
#   PLAYWRIGHT_BROWSERS_PATH (/ms-playwright), draws the compositions.
# - ffmpeg: Ubuntu noble's own build, at a version and from a dated snapshot
#   of the archive (below), so a rebuild installs the same packages.
# - the recorders, the stage and the motion: this checkout, at the commit the
#   image is labelled with (`org.opencontainers.image.revision`).
#
# The stage is served by the recorders themselves (`siteOf` in
# tests/record/voiced.ts) from /opt/stage, given as `--dist /opt/stage`: no
# stage container, and no build of the whole app.
#
# What paulgsc/server's call-render.yml relies on: the recorders run from
# /opt/some-ui/apps/www with /opt/some-ui/node_modules/.bin/tsx; the motion
# from /opt/some-ui/packages/video-motion with its own node_modules/.bin/tsx;
# the stage at /opt/stage; nothing in /usr/local/bin (render-calls.sh is
# mounted there); nothing fetched at run time.
FROM mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e

# ffmpeg from snapshot.ubuntu.com, which serves the archive as it stood at
# UBUNTU_SNAPSHOT: the version and every package it pulls in are what they
# were then, signed by the same archive key, so a rebuild months later is the
# same install. FFMPEG_VERSION is noble's release build (the base already
# carries its libav* libraries at that version). Move both together.
ARG UBUNTU_SNAPSHOT=20261110T000000Z
ARG FFMPEG_VERSION=7:6.1.1-3ubuntu5
RUN rm -f /etc/apt/sources.list /etc/apt/sources.list.d/* \
    && printf '%s\n' \
       'Types: deb' \
       "URIs: https://snapshot.ubuntu.com/ubuntu/${UBUNTU_SNAPSHOT}" \
       'Suites: noble noble-updates noble-security' \
       'Components: main universe' \
       'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg' \
       > /etc/apt/sources.list.d/ubuntu-snapshot.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends "ffmpeg=${FFMPEG_VERSION}" \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/some-ui
COPY . .

# One install and one build for all of it (infra/render/build.sh says what it
# builds, and who else runs it), then the stage into /opt/stage.
RUN corepack enable \
    && sh infra/render/build.sh \
    && mv apps/www/out/stage /opt/stage \
    && rm -rf apps/www/out /root/.cache /root/.local/share/pnpm/store

ARG SOME_UI_COMMIT=
LABEL org.opencontainers.image.source="https://github.com/paulgsc/some-ui" \
      org.opencontainers.image.revision="${SOME_UI_COMMIT}"

# What this image needs from the release it runs in (RELEASE R3,
# paulgsc/server#790; U2, #792). paulgsc/server's check_release.py reads these
# from the published digest and refuses a release whose file_host does not
# provide what render requires.
# - render-folders: the layout of the folders file_host writes and this image
#   reads (call-weeks, playoff-delta-episodes, preview-requests, rust-essays),
#   RENDER_FOLDERS_EPOCH in server's apps/servers/file_host/src/contract.rs.
#   Raise it here in the same change that makes the recorders read a new
#   layout.
# It provides nothing.
LABEL io.paulgsc.provides="" \
      io.paulgsc.requires="render-folders=1"

# The root is read-only at run time (call-render.yml); tsx and the renderer
# write only under /tmp.
ENV HOME=/tmp \
    XDG_CACHE_HOME=/tmp/.cache \
    TSX_CACHE_DIR=/tmp/tsx \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
