/**
 * The learner's takes of grammar-lens lines, on the phone (adaptive-learning
 * canon Rem. 4.16; `@some-ui/topik`'s `LensTakes`): a desk of takes on the
 * take pattern (`lib/takes-desk`'s `patternDesk`), at most forty, each at
 * most thirty seconds. A line keeps many takes beside each other, and only
 * the newest plays (MIC5): Redo makes the new take the one the line shows
 * and keeps the earlier (D2), and Let go sets a take aside, kept (D3).
 * Phone-only (`build.paths.ts`).
 */
import type { LensTakes } from "@some-ui/topik"

import { patternDesk, patternPort } from "@/lib/takes-desk"

import { LENS_TAKE_MAX_MS, LENS_TAKES_MAX } from "./budget"

export type { Take as LensTake } from "@/lib/takes-desk"

const desk = patternDesk({
  key: "some-ui:lens-takes",
  screen: "topik.grammar-lens",
  from: "lens",
  dbName: "some-ui.lens-takes",
  limits: { max: LENS_TAKES_MAX, maxMs: LENS_TAKE_MAX_MS },
  // As many a line as the desk keeps, the newest played, as "Mine" was.
  shape: {
    takes: { per: "many", max: LENS_TAKES_MAX, full: "refuse" },
    play: "latest",
  },
})

export const sweepLensTakes = desk.sweep
export const lensTakesForExport = desk.forExport
/** The desk, for the copy home (`lib/home-link/voice-copy`). */
export const lensTakesDesk = desk

let port: LensTakes | null = null

/** The phone's grammar-lens takes, as topik's port. */
export function phoneLensTakes(): LensTakes {
  port ??= patternPort(desk)
  return port
}
