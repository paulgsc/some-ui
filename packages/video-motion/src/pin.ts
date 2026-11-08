/** Every pin a composition is rendered with, besides its own files: the README says why each. */

import { BITEXACT, QUIET } from "@some-ui/video-render"

/** The HyperFrames release every composition is drawn with. */
export const HYPERFRAMES_VERSION = "0.9.22"

/** What a composition is rendered with, besides its own folder. */
export type Run = {
  /** The copy of the composition's folder that is rendered (render.ts). */
  readonly project: string
  /** Where the PNG frames go: a folder of their own. */
  readonly frames: string
  /** A JSON file of the composition's variables. */
  readonly variables: string
  readonly fps: number
}

/** The arguments after the `hyperframes` command. */
export const renderArgs = (run: Run): ReadonlyArray<string> => [
  "render",
  run.project,
  "--output",
  run.frames,
  "--format",
  "png-sequence",
  "--fps",
  String(run.fps),
  "--variables-file",
  run.variables,
  "--strict-variables",
  "--strict",
  "--no-best-effort",
  "--workers",
  "1",
  "--low-memory-mode",
  "--no-browser-gpu",
  "--quiet",
]

/**
 * Chrome's own switches for drawing only once every raster is done, which
 * HyperFrames adds for its BeginFrame capture but not for the screenshots
 * `--low-memory-mode` takes (#2739). Without them a screenshot can catch an
 * element mid re-raster: on CI, the sample's mark differed at its edges for
 * a few frames after its last scale key, by up to 14 of 255.
 */
export const DRAW_FLAGS = [
  "--run-all-compositor-stages-before-draw",
  "--disable-new-content-rendering-timeout",
  "--disable-checker-imaging",
] as const

/**
 * A shell script that starts `chrome` with `DRAW_FLAGS` before HyperFrames'
 * own arguments, since HyperFrames takes no switches of ours: it is named as
 * the browser (`renderEnv`).
 */
export const chromeWrapper = (chrome: string): string =>
  [
    "#!/bin/sh",
    `exec '${chrome.replaceAll("'", `'\\''`)}' ${DRAW_FLAGS.join(" ")} "$@"`,
    "",
  ].join("\n")

/**
 * The environment HyperFrames runs in: the caller's, with telemetry off,
 * low memory set, the browser named, and its temporary files on `tmp`. Home's
 * /tmp is a 1 GB RAM disk counted against the render's memory, and
 * HyperFrames refuses to start with that little room, so `tmp` is on the
 * work drive, named by a short link (render.ts): Chrome makes sockets in it,
 * and a socket's path past about 108 bytes aborts Chrome.
 */
export const renderEnv = (
  base: Readonly<Record<string, string | undefined>>,
  chrome: string,
  tmp: string
): Record<string, string> => {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(base)) if (v !== undefined) env[k] = v
  return {
    ...env,
    HYPERFRAMES_NO_TELEMETRY: "1",
    DO_NOT_TRACK: "1",
    PRODUCER_LOW_MEMORY_MODE: "true",
    PRODUCER_HEADLESS_SHELL_PATH: chrome,
    TMPDIR: tmp,
  }
}

/**
 * The frames as one lossless clip: FFV1, RGB, one thread, no metadata, so
 * the same frames give the same bytes on any machine with the same ffmpeg.
 */
export const encodeArgs = (
  frames: string,
  fps: number,
  count: number,
  out: string
): ReadonlyArray<string> => [
  ...QUIET,
  "-threads",
  "1",
  "-framerate",
  String(fps),
  "-i",
  `${frames}/frame_%06d.png`,
  "-frames:v",
  String(count),
  "-c:v",
  "ffv1",
  "-level",
  "3",
  "-pix_fmt",
  "bgr0",
  "-threads",
  "1",
  ...BITEXACT,
  out,
]

/** The lines of HyperFrames' output that say it fetched a font from the network. */
export const fetched = (output: string): ReadonlyArray<string> =>
  output.split("\n").filter((l) => /\bFetched\b.*\bGoogle Fonts\b/.test(l))
