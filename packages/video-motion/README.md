# @some-ui/video-motion

The motion in my videos, drawn by [HyperFrames](https://github.com/heygen-com/hyperframes)
(Apache-2.0) rather than by code I write (HYPER, epic #2722). A composition is a folder
of plain HTML under `compositions/`, animated on a paused, seeked timeline. This
workspace renders one to a lossless clip, the same bytes every time, which
`@some-ui/video-render` treats as a scene's picture (HYPER2, #2725).

```sh
pnpm --filter @some-ui/video-motion motion prove sample
pnpm --filter @some-ui/video-motion motion render sample --out sample.mkv --variables v.json
pnpm --filter @some-ui/video-motion motion video <video folder> [--series <folder>] [--prove]
```

- `prove` renders a composition twice and fails unless the two clips are the same bytes,
  printing each one's sum and time.
- `video` renders a video folder's `cut-list.json` through `@some-ui/video-render` into
  `video.mp4` beside it, its composition scenes drawn here (`src/node.ts`, the renderer's
  `compositions` port). Each step is kept in the folder's `cache/`, so a retry draws only
  the scenes whose inputs changed; with `--prove` it is drawn twice from nothing and fails
  unless the bytes match. The series is `series/vertical` unless named:
  1080x1920 at 30 fps, the frame alone, for videos whose scenes are compositions.
  `sample/video` is a composition scene, then a card.

CI runs both on every change here (`pr.yml`, "HyperFrames renders the same bytes twice").
They need `ffmpeg` on `PATH` and a Chromium: Playwright's pinned one by default, or
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, or `--chrome`.

## The pins, and why

`src/pin.ts` holds every one, and its test holds them.

- **`hyperframes` is exactly `0.9.22`.** It releases about daily and is pre-1.0, so a range
  would change the frames with no commit. A bump is a change of its own, proven
  twice-equal again with `motion prove`, here and on home.
- **One worker, `--low-memory-mode`, no GPU.** Home's `render` service has 4 GB and 2 CPUs
  (paulgsc/server `infra/compose/call-render.yml`). Each worker is a Chrome of about
  256 MB, and HyperFrames' own low-memory check reads the host's RAM, not the container's,
  so the mode is set (`PRODUCER_LOW_MEMORY_MODE` too), never detected. Without a GPU,
  Chrome draws with SwiftShader.
- **Telemetry off:** `HYPERFRAMES_NO_TELEMETRY=1` and `DO_NOT_TRACK=1` on every run.
- **Frames, then our ffmpeg.** HyperFrames' own MP4 is not the same bytes twice (measured on
  0.9.22: the PNG frames matched, the MP4s did not), so it writes PNG frames and the clip
  is encoded here: FFV1, RGB, one thread, bit-exact, as the renderer's VR1 does each step.
- **The Chromium we already pin**, Playwright's (`playwright-core` 1.62.1, the recorders'),
  not HyperFrames' `render --docker` image: one browser to pin. The sample gave the same
  bytes on Playwright 1.62.1's Chromium (home's image) and 1.63's, full and headless shell.
- **Strict:** a lint error, an undeclared variable or unready media fails the render.
- **No network.** Every font is vendored by the lockfile (`src/fonts.ts`, `@fontsource/*`,
  OFL) and copied in beside the composition. A font HyperFrames reached the network for
  fails the render, since home's render network reaches nothing.
- **Its temporary files on the work drive.** HyperFrames refuses to start with home's 1 GB
  `/tmp` (a RAM disk, counted against the render's memory), so `TMPDIR` is the work folder.

Measured on home's image and limits (Playwright 1.62.1-noble, Ubuntu noble's ffmpeg,
`--memory 4g --cpus 2 --network none`, uid 10000, read-only root), 2026-11-08: the sample
(2 s, 60 frames) took 9.4 s a run, the same bytes three times (`a9c7b986…`), and the
container peaked at 576 MB. Bytes match per machine, not across machines: another
Chromium or CPU draws its own.

## Writing a composition

- **What a render copies in beside it:** `lib/` (`compositions/_lib`, what they share), the brand's
  mark as `brand/mark.svg` (`packages/some-styles/brand/favicon.svg`), the fonts under
  `fonts/`, and the files a cut list names under `assets/`. A scene's length is set on the
  root's `data-duration`, and its size must be the video's frame, unless the root is marked
  `data-fit-frame`: then the runner sets its `data-width` and `data-height` to the frame, and
  its CSS sizes everything in `%` and `vmin`.
- **Paint the ground on the root.** HyperFrames captures the page with no background, so
  anything see-through over `body`'s colour loses its blend.
- **Name nothing at the top level of a script after a `window` property** (`top`, `name`,
  `status`): the page throws and draws nothing.

- **Motion through `lib/motion.js`'s `track`, nothing else.** Each frame's styles are set
  from its time when HyperFrames seeks to it, so no animation runs on a timeline of the
  browser's own: CSS keyframes and the Web Animations API, seeked by HyperFrames, gave two
  sums on one CI machine (#2737). The root is marked `data-no-timeline`. Not GSAP, whose
  licence is not open source (ask #2723), though most of the catalogue animates with it.
- **Android only:** the catalogue's iPhone, macOS and App Store blocks fail
  `pnpm check:android-only`; use `device-frame-stage` and a Google Play badge.
- **No clock, no unseeded randomness, no fetch.** Every string and colour is a variable
  (`data-composition-variables`), read with `window.__hyperframes.getVariables()`.

## The brand's open and close

Every version is kept (HYPER5, #2728). A version is one composition, `compositions/brand-v<n>`:

- `part` (`open` or `close`, an `enum` HyperFrames itself holds to) picks which it draws;
- it fits any frame (`data-fit-frame`), so the call's 16:9 and a vertical share it;
- it carries its own copy of the mark, `mark.svg`, never `brand/mark.svg`, so a new mark
  doesn't reach an old version.

`src/brand.ts` pins each version's files by sha256, and its test fails if a released version
is edited. A new mark (ask #2674), or a new motion, is a new folder and a new entry there.
Version 1 is today's still mochi, drawn in with a small overshoot and out with a shrink. What
the versions share, `lib/motion.js`, isn't pinned: a change there must keep what `track`
draws for the keys a version uses.
