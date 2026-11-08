/**
 * The page's side of the recording protocol (STUDIO ST15), which the
 * recorder (`apps/www/tests/record/burn-ins.ts`) drives through the page
 * global `someUiBurnIns`:
 *
 * - `load(burnIn)` checks a burn-in as the cut list carries it, for the
 *   video's `frame` (its width and height; the 9:16 short when it names
 *   none), and shows it on a stage that size, or gives every reason it
 *   can't be drawn;
 * - `seek(atMs)` shows the moment `atMs` ms into it and resolves once that
 *   moment is painted with its fonts loaded, with a key for the picture:
 *   equal keys, equal pictures, so the recorder captures a picture only
 *   when it changes, and a burn-in that holds still is captured once;
 * - `check({ burnIns, fps, frame })`, before any is recorded, gives every
 *   pair of a video's burn-ins that would draw in one region at one moment
 *   of that frame (`lib/clash.ts`; the short when it names none), so the
 *   renderer refuses the video instead.
 *
 * The frame is `frameAt`'s, so the recording is the preview at that moment.
 * This runtime owns the waiting; the component only draws the snapshot and
 * says when it has (`drew`).
 */

import {
  frameAt,
  prepare,
  runtimeMs,
  type BurnInData,
  type BurnInFrame,
  type Prepared,
} from "@burn-ins/lib/burn-in"
import type { PlacedBurnIn } from "@burn-ins/lib/clash"
import { clashes } from "@burn-ins/lib/clash"
import {
  geometryOf,
  PORTRAIT,
  type FrameSize,
  type Geometry,
} from "@burn-ins/lib/geometry"
import type { Parsed } from "@burn-ins/lib/parsed"

export type RecordPorts = {
  /** Resolves once every font the page asked for has loaded. */
  readonly fontsReady: () => Promise<void>
  /** Resolves after the next paint. */
  readonly afterPaint: () => Promise<void>
}

type RecordSnapshot = {
  /** Counts what was shown, so `drew` names which. */
  readonly seq: number
  readonly frame: BurnInFrame | null
  /** The frame the stage is drawn at: the loaded burn-in's. */
  readonly geometry: Geometry
}

/** What the page is asked to load: a burn-in, and the video's frame. */
type LoadRequest = BurnInData & { readonly frame?: FrameSize }

export type Recorder = {
  readonly load: (
    burnIn: LoadRequest
  ) => Parsed<{ readonly runtimeMs: number | null }>
  readonly seek: (atMs: number) => Promise<string>
  readonly check: (video: {
    readonly burnIns: ReadonlyArray<PlacedBurnIn>
    readonly fps: number
    readonly frame?: FrameSize
  }) => ReadonlyArray<string>
  readonly subscribe: (listener: () => void) => () => void
  readonly getSnapshot: () => RecordSnapshot
  /** The component drew snapshot `seq`. */
  readonly drew: (seq: number) => void
}

/** The page global the recorder reaches the runtime by. */
export const RECORDER_GLOBAL = "someUiBurnIns"

export function createRecorder(ports: RecordPorts): Recorder {
  let prepared: Prepared | null = null
  let snapshot: RecordSnapshot = {
    seq: 0,
    frame: null,
    geometry: geometryOf(PORTRAIT),
  }
  /** The key of the picture on screen, once painted. */
  let shown: string | null = null
  let drawn = 0
  const waiting = new Map<number, () => void>()
  const listeners = new Set<() => void>()

  const show = (
    frame: BurnInFrame | null,
    geometry: Geometry = snapshot.geometry
  ): number => {
    snapshot = { seq: snapshot.seq + 1, frame, geometry }
    shown = null
    listeners.forEach((l) => l())
    return snapshot.seq
  }

  const drawnAt = (seq: number): Promise<void> =>
    drawn >= seq
      ? Promise.resolve()
      : new Promise((resolve) => waiting.set(seq, resolve))

  return {
    load: ({
      frame = PORTRAIT,
      ...burnIn
    }): Parsed<{ readonly runtimeMs: number | null }> => {
      const p = prepare(burnIn, frame)
      prepared = p.ok ? p.value : null
      show(null, p.ok ? geometryOf(frame) : snapshot.geometry)
      return p.ok ? { ok: true, value: { runtimeMs: runtimeMs(p.value) } } : p
    },
    seek: async (atMs): Promise<string> => {
      if (prepared === null) throw new Error("nothing is loaded")
      const frame = frameAt(prepared, atMs)
      const key = JSON.stringify(frame)
      if (key === shown) return key
      const seq = show(frame)
      await drawnAt(seq)
      await ports.afterPaint()
      await ports.fontsReady()
      await ports.afterPaint()
      // A newer seek may have replaced this frame while it waited.
      if (snapshot.seq === seq) shown = key
      return key
    },
    check: ({ burnIns, fps, frame = PORTRAIT }): ReadonlyArray<string> =>
      clashes(burnIns, fps, frame),
    subscribe: (listener) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => snapshot,
    drew: (seq): void => {
      drawn = Math.max(drawn, seq)
      for (const [s, resolve] of waiting) {
        if (s <= drawn) {
          waiting.delete(s)
          resolve()
        }
      }
    },
  }
}

export const browserRecordPorts: RecordPorts = {
  fontsReady: async () => {
    await document.fonts.ready
  },
  afterPaint: () =>
    new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }),
}
