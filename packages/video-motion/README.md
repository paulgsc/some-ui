# @some-ui/video-motion

The motion in my videos, drawn by [HyperFrames](https://github.com/heygen-com/hyperframes)
(Apache-2.0) rather than by code I write (HYPER, epic #2722). A composition is a folder
of plain HTML under `compositions/`, animated on a paused, seeked timeline. This
workspace renders one to a lossless clip, the same bytes every time, which
`@some-ui/video-render` treats as a scene's picture (HYPER2, #2725).

```sh
pnpm --filter @some-ui/video-motion motion prove sample
pnpm --filter @some-ui/video-motion motion render sample --out sample.mkv --variables v.json
pnpm --filter @some-ui/video-motion motion video <video folder> [--series <folder>] [--brand <folder>] [--prove]
```

- `prove` renders a composition `--runs` times (two unless given) and fails unless every
  clip is the same bytes, printing each one's sum and time. When two differ it names the
  frames that do and, for the first four, where: the box of the pixels that differ, how
  many, the largest change in a channel, how many the second run draws lighter, and the
  first few pixels in both runs' colours (`src/difference.ts`, #2739). A box over one
  element says something drew it differently; one over the whole frame, the capture.
- `video` renders a video folder's `cut-list.json` through `@some-ui/video-render` into
  `video.mp4` beside it, its composition scenes drawn here (`src/node.ts`, the renderer's
  `compositions` port). Each step is kept in the folder's `cache/`, so a retry draws only
  the scenes whose inputs changed; with `--prove` it is drawn twice from nothing and fails
  unless the bytes match. The series is `series/vertical` unless named:
  1080x1920 at 30 fps, the frame alone, for videos whose scenes are compositions.
  `sample/video` is a composition scene, then a card.

- `--brand` names home's brand folder (`/brand` in the render service): the series' music bed
  and sound kit are copied into the video's folder from it first (`placeBrandFiles` in
  `@some-ui/video-render/node`), and the renderer refuses any file whose sum isn't the
  series' pin.

- `walk <app> --sample <file> --out <folder>` replays an app's scripted walk (SFEED7a,
  #2736) in a sandbox holding only the sample: the app's own built pages, served from
  `http://sandbox.invalid` with every other request refused, driven step by step. It
  writes each step's screen as a snip and `walk.json`: each snip's time and each tap's
  place and time, on the walk's own timeline. Suspender Ledger's popup is the first
  (`src/walk/suspender-ledger.ts`); its stand-ins answer the popup's four reads from the
  sample.
- `promo <release folder> --out <folder> [--brand <folder>] [--prove]` makes a release's promo (HYPER3,
  #2726): the folder's `release.json` (`some-ui.promo/1`, the words a session writes) and
  `sample.json` (the walk's), from paulgsc/testing's `promo/<app>/<version>/`. It walks
  the app into `<out>`, writes a cut list of three composition scenes (`promo-hook`, the
  walk's screens in `promo-feature`, `promo-close`; `src/promo.ts`) and renders it as
  `video` does. The release's version must be the built app's, and the fill needs one
  caption per screen; each line is held to what fits its place in the frame. It pins
  `series/vertical` version 2, which names the sound kit (HYPER4, #2727): a whoosh as the
  hook leaves, a pop as the frame opens, a click on each tap, a whoosh as the feature
  leaves and a ding as the close's mark comes in. So it needs `--brand`, whose `sounds/` holds
  the kit `render sounds --out <brand>/sounds` writes (`@some-ui/video-render`'s `cues.ts`).

CI runs `prove`, `video` and `promo` on every change here (`pr.yml`, "HyperFrames renders the
same bytes twice"). They need `ffmpeg` on `PATH` and Playwright's Chromium **headless shell**:
found under `PLAYWRIGHT_BROWSERS_PATH` or Playwright's cache, or named with `--chrome`
(`src/browser.ts`). The full Chrome is refused (see "The pins, and why").

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
- **Playwright's headless shell, every tile rastered whole, drawn only once raster is done.**
  Not HyperFrames' `render --docker` image: the browser is Playwright's, as the recorders'
  is (home's image, CI's nix shell). HyperFrames starts it through a wrapper adding
  Chrome's own switches (`DRAW_FLAGS` in `src/pin.ts`), since it takes none of ours:

  - `--disable-partial-raster`: with partial raster, a reused tile is redrawn only inside
    what changed, and antialiased edge pixels just outside it can keep the frame before's
    (measured here: it changes a few edge pixels of the moving mark). A guard, not the
    cause of #2739, which was layer demotion ("Writing a composition").
  - `--run-all-compositor-stages-before-draw` and two more, which HyperFrames adds only
    for its BeginFrame capture, not for the screenshots `--low-memory-mode` takes, so a
    screenshot never catches a tile mid-raster.

  The wrapper is written into the render's work folder and run once with `--version`
  first, so a drive mounted `noexec` fails with a reason. The full Chrome never draws a
  frame with the second, so it is refused. The headless
  shell's revision is the environment's (home's image, CI's flake; the newest found),
  which is why bytes match per machine.

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
  root's `data-duration`, and its size must be the video's frame.
- **Paint the ground on the root.** HyperFrames captures the page with no background, so
  anything see-through over `body`'s colour loses its blend.
- **Name nothing at the top level of a script after a `window` property** (`top`, `name`,
  `status`): the page throws and draws nothing.

- **Motion through `lib/motion.js`'s `track`, nothing else.** Each frame's styles are set
  from its time when HyperFrames seeks to it, so no animation runs on a timeline of the
  browser's own: CSS keyframes and the Web Animations API, seeked by HyperFrames, gave two
  sums on one CI machine (#2737). The root is marked `data-no-timeline`. `track` also puts each element it moves on a layer of
  its own for the whole scene (`will-change: transform, opacity`): Chrome otherwise moves a
  still element back into the page's layer at a moment that depends on timing, and the two
  draw its edges differently (#2739). Not GSAP, whose
  licence is not open source (ask #2723), though most of the catalogue animates with it.
- **Android only:** the catalogue's iPhone, macOS and App Store blocks fail
  `pnpm check:android-only`; use `device-frame-stage` and a Google Play badge.
- **No clock, no unseeded randomness, no fetch.** Every string and colour is a variable
  (`data-composition-variables`), read with `window.__hyperframes.getVariables()`.
