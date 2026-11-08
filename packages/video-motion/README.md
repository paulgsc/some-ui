# @some-ui/video-motion

The motion in my videos, drawn by [HyperFrames](https://github.com/heygen-com/hyperframes)
(Apache-2.0) rather than by code I write (HYPER, epic #2722). A composition is a folder
of plain HTML under `compositions/`, animated on a paused, seeked timeline. This
workspace renders one to a lossless clip, the same bytes every time, which
`@some-ui/video-render` treats as a scene's picture (HYPER2, #2725).

```sh
pnpm --filter @some-ui/video-motion motion prove sample
pnpm --filter @some-ui/video-motion motion render sample --out sample.mkv --variables v.json
```

`prove` renders a composition twice and fails unless the two clips are the same bytes,
printing each one's sum and time. CI runs it on every change here (`pr.yml`, "HyperFrames
renders the same bytes twice"). Needs `ffmpeg` on `PATH` and a Chromium: Playwright's
pinned one by default, or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, or `--chrome`.

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
(2 s, 60 frames) took 9.5 s a run, the container peaked at 528 MB, and both runs and the
sandbox's own matched (`ecfbf33c…`).

## Writing a composition

- **No GSAP yet.** Most of HyperFrames' catalogue animates with GSAP, whose licence is not
  open source (ask #2723). Until it is answered, compositions use CSS keyframes and the Web
  Animations API (each animation `pause()`d, so HyperFrames seeks it) and mark the root
  `data-no-timeline`.
- **Android only:** the catalogue's iPhone, macOS and App Store blocks fail
  `pnpm check:android-only`; use `device-frame-stage` and a Google Play badge.
- **No clock, no unseeded randomness, no fetch.** Every string and colour is a variable
  (`data-composition-variables`), read with `window.__hyperframes.getVariables()`.
