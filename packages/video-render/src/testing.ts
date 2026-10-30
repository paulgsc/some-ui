/**
 * Fixtures for tests of the renderer and of what drives it (`apps/www`'s
 * recorder spec): a series, a scene, a capture and a cut list with every
 * field a test doesn't care about set to something drawable.
 */

import { CUT_LIST_SCHEMA } from "./cut-list"
import type { CutList, Shot } from "./cut-list"
import { SERIES_SCHEMA } from "./series"
import type { Series } from "./series"
import type { Motion, MotionKind } from "./vocabulary"

export const SUM = "a".repeat(64)

export function series(over: Partial<Series> = {}): Series {
  return {
    schema: SERIES_SCHEMA,
    id: "fixture",
    version: 1,
    title: "Fixture",
    frame: { width: 1080, height: 1920, fps: 30 },
    ground: "#111821",
    window: { x: 54, y: 250, width: 972, height: 1450 },
    defaultLook: "calm",
    music: { bed: { file: "kit/bed.wav", sha256: SUM }, gainDb: -14 },
    sounds: {
      click: { file: "kit/click.wav", sha256: SUM },
      whoosh: { file: "kit/whoosh.wav", sha256: SUM },
    },
    soundGainDb: -8,
    ...over,
  }
}

/** A capture of `captures/walk.mp4` from `inMs`, cropped as recorded. */
export function capture(
  inMs: number,
  over: Partial<Extract<Shot["picture"], { kind: "capture" }>> = {}
): Shot["picture"] {
  return {
    kind: "capture",
    source: "captures/walk.mp4",
    inMs,
    speed: 1,
    cssWidth: 206,
    framing: { mode: "crop", zoom: 1, x: 0, y: 0 },
    taps: [],
    ...over,
  }
}

export function shot(id: string, over: Partial<Shot> = {}): Shot {
  return {
    id,
    picture: capture(0, { cssWidth: 412 }),
    durationMs: 2000,
    voiceInMs: 200,
    overrides: {},
    burnIns: [],
    idea: { origin: "agent" },
    ...over,
  }
}

export function cutList(
  shots: ReadonlyArray<Shot>,
  over: Partial<CutList> = {}
): CutList {
  return {
    schema: CUT_LIST_SCHEMA,
    title: "Fixture",
    series: { id: "fixture", version: 1 },
    look: "calm",
    voice: "ad-lib",
    shots: [...shots],
    burnIns: [],
    revisions: [],
    notes: [],
    ...over,
  }
}

/** One of each motion, timed to fit a scene of a second or more. */
export const MOTIONS: Readonly<Record<MotionKind, Motion>> = {
  still: { kind: "still" },
  "push-in": { kind: "push-in", amount: 0.1 },
  "pull-out": { kind: "pull-out", amount: 0.1 },
  pan: {
    kind: "pan",
    keys: [
      [0, 0],
      [800, 200],
    ],
  },
  "punch-in": { kind: "punch-in", at: [300, 800], amount: 0.2 },
  freeze: { kind: "freeze", atMs: 500 },
}
