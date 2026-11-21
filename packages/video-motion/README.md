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
  #2736; WALK1, #3282) on a stage holding only the sample, driven step by step. It writes
  each step's screen as a snip and `walk.json`: each snip's time and each tap's place and
  time, on the walk's own timeline. A step is one of a closed set of actions (open, tap,
  type, dwell), and a walk names its stage (C860, `src/walk/run.ts`):

  - **sandbox** (`src/walk/stage-sandbox.ts`): the app's own built pages, served from
    `http://sandbox.invalid` with every other request refused. Suspender Ledger's popup
    walks here (`src/walk/suspender-ledger.ts`); its stand-ins answer the popup's four
    reads from the sample.
  - **apk** (`src/walk/stage-apk.ts`): the debug APK on a booted emulator, its WebView
    driven by Playwright, each snip the whole screen. Jobs walks here
    (`src/walk/jobs.ts`), against the stand-in home answering its story sample
    (`apps/www/tests/walk/jobs-week.json`), run by `apps/mobile/walk/walk-apk.sh` inside
    Snips Capture's emulator.

  A walk can also be given a microphone (`src/walk/microphone.ts`, WALK3): the page's
  audio `getUserMedia` answers a canned clip, so the app's own recorder records it.

  `promo-feature` draws a walk's screens at their own pixels, made smaller only where
  they would not fit above the caption: a popup's walk at full size, an APK walk's whole
  9:16 screen at 1320 px tall, about seven tenths of the frame's width, its caption just
  below it (the owner, 2026-11-21: the phone at three-quarter size, the caption below).

- `walkthrough <words.json> --walk <walk folder> --out <folder> [--home <weekly.json>] [--takes <folder> | --speaker <url>] [--brand <folder>] [--prove]`
  makes an app's walkthrough (WALK4, #3282): the promo with chapters. The words
  (`some-ui.walkthrough/1`, `src/walkthrough.ts`) give a caption per screen and the stops,
  each from a screen of the walk; the cut list is the promo's opening, then per stop a
  chapter card (`walk-chapter`) and that stop's screens in `promo-feature`, then the
  promo's close. It takes a walk already made, since an APK walk needs the emulator:
  Snips Capture's `walks-<run>` artifact holds `jobs/`. Jobs' words are
  `apps/www/tests/walk/jobs-walkthrough.json`.

  Voiced (WALK5, #3337; the owner's call C945). It writes `lines.json`, every line home's
  Kokoro says: each stop says its own `narration` from the words (part promo, part mission:
  what the screen can't show), never its captions, and the chapter cards stay silent. With
  `--home` (home's weekly read, `GET /app-events/weeks/:week`; mapped onto the registry by
  `frictionOf` and kept as `friction.json`), each stop then says what real use shows of it,
  its card shows the same, and the last stop names the modules nobody opens, with a card
  before the close (#3338). With `--takes` (the folder the lines were said into: `<file>.wav`
  and `<file>.json`, `{ms, words}`), each stop's lines are laid back to back a breath apart
  into `<shot>.wav`, and its screens are stretched by one factor until they hold them (C1000).
  With `--speaker <url>` instead (home's Kokoro, as `http://kokoro:8880`), it says `lines.json`
  itself into `<out>/takes`, each take kept in that folder's step cache, as the recorders do
  (`@some-ui/video-render/node`'s `sayLines`).

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

## A screen, zoomed to its parts

`screen-zoom` (RR31, #3288; calls C795, C796) shows one photographed screen whole, eases in
to each region it is given in turn, a ring on it, and back out. The screen and its regions
come from a `some-ui.screens/1` record (`@some-ui/video-render`'s `screen.ts`): the Rust
essay's capture photographs the phone's own ticket cards from the owner's week, and any
other capture may photograph a screen whose parts carry `data-region`. `zoomPicture` in
`@some-ui/video-render` turns a record and a list of region names into the composition
picture any cut list can place, with the picture in its files. It fits any frame and keeps
`foot` of the frame's height clear for captions.

`sample/zoom` is one: a mock Rust Rounds card on sample data (not the app's own drawing),
zoomed to its question, its code and rustc's error, in the vertical series.

CI runs `prove`, `video` (on `sample/video` and `sample/zoom`) and `promo` on every change here (`pr.yml`, "HyperFrames renders the
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
  sums on one CI machine (#2737). The root is marked `data-no-timeline`. `track` also puts each element it moves on a layer of
  its own for the whole scene (`will-change: transform, opacity`): Chrome otherwise moves a
  still element back into the page's layer at a moment that depends on timing, and the two
  draw its edges differently (#2739). Not GSAP, whose
  licence is not open source (ask #2723), though most of the catalogue animates with it.
- **Android only:** the catalogue's iPhone, macOS and App Store blocks fail
  `pnpm check:android-only`; use `device-frame-stage` and a Google Play badge.
- **No clock, no unseeded randomness, no fetch.** Every string and colour is a variable
  (`data-composition-variables`), read with `window.__hyperframes.getVariables()`.

## The brand's open and close

Every version is kept (HYPER5, #2728). A version is one composition, `compositions/brand-v<n>`:

- `part` (`open` or `close`, an `enum` HyperFrames itself holds to) picks which it draws;
- it fits any frame (`data-fit-frame`), so the call's 16:9 and a vertical share it;
- `theme`, one of the app's themes, picks the mark's colours. The mark is the app's own, from
  the code (`@some-ui/styles`' `brand/mark`): the runner writes it as `mark.svg` in that
  theme at render time (`src/mark.ts`), and gives the theme's ground as `ground` unless the
  cut list sets one. So the mark follows the code, and the template names its theme
  (`brand.theme`, `markThemeOf`; ask #2674).

`src/brand.ts` pins each version's files by sha256, and its test fails if a released version
is edited: a version freezes its motion, and a new motion is a new folder and a new entry there.
Version 1 is the still mochi, drawn in with a small overshoot and out with a shrink. What
the versions share, `lib/motion.js`, isn't pinned: a change there must keep what `track`
draws for the keys a version uses. The step cache's pin covers every theme's mark, so a retuned
theme draws again.
