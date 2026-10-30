/**
 * The page's side of the recording protocol (STUDIO ST15), which the
 * recorder (`apps/www/tests/record/burn-ins.ts`) drives through the page
 * global `someUiBurnIns`:
 *
 * - `load(burnIn)` checks a burn-in as the cut list carries it and shows it,
 *   or gives every reason it can't be drawn;
 * - `seek(atMs)` shows the moment `atMs` ms into it and resolves once that
 *   moment is painted with its fonts loaded, with a key for the picture:
 *   equal keys, equal pictures, so the recorder captures a picture only
 *   when it changes, and a burn-in that holds still is captured once.
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
}

export type Recorder = {
  readonly load: (
    burnIn: BurnInData
  ) => Parsed<{ readonly runtimeMs: number | null }>
  readonly seek: (atMs: number) => Promise<string>
  readonly subscribe: (listener: () => void) => () => void
  readonly getSnapshot: () => RecordSnapshot
  /** The component drew snapshot `seq`. */
  readonly drew: (seq: number) => void
}

/** The page global the recorder reaches the runtime by. */
export const RECORDER_GLOBAL = "someUiBurnIns"

export function createRecorder(ports: RecordPorts): Recorder {
  let prepared: Prepared | null = null
  let snapshot: RecordSnapshot = { seq: 0, frame: null }
  /** The key of the picture on screen, once painted. */
  let shown: string | null = null
  let drawn = 0
  const waiting = new Map<number, () => void>()
  const listeners = new Set<() => void>()

  const show = (frame: BurnInFrame | null): number => {
    snapshot = { seq: snapshot.seq + 1, frame }
    shown = null
    listeners.forEach((l) => l())
    return snapshot.seq
  }

  const drawnAt = (seq: number): Promise<void> =>
    drawn >= seq
      ? Promise.resolve()
      : new Promise((resolve) => waiting.set(seq, resolve))

  return {
    load: (burnIn): Parsed<{ readonly runtimeMs: number | null }> => {
      const p = prepare(burnIn)
      prepared = p.ok ? p.value : null
      show(null)
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
