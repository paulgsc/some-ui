/**
 * The hunches spoken in KPLAY's shop (KP4, #2853), on the phone: a desk of
 * takes on the take pattern (`lib/takes-desk`'s `patternDesk`), one per
 * hunch, its item the hunch's name, at most thirty seconds each. Each goes
 * home as a voice note of kind `hunch` whose ref is that name (paulgsc/server
 * #1265, C1607), by the voice lane, so a hunch said with home out of reach
 * is kept here until home has it (#3596). It has no Let go: the take is
 * the owner's words, and home keeps it. Phone-only (`build.paths.ts`).
 */
import { patternDesk, patternPort } from "@/lib/takes-desk"

import { HUNCH_TAKE_MAX_MS, HUNCH_TAKES_MAX } from "./budget"

export type { Take as HunchTake } from "@/lib/takes-desk"

const desk = patternDesk({
  key: "some-ui:hunch-takes",
  screen: "topik.shop",
  from: null,
  dbName: "some-ui.hunch-takes",
  limits: { max: HUNCH_TAKES_MAX, maxMs: HUNCH_TAKE_MAX_MS },
})

export const sweepHunchTakes = desk.sweep
/** The desk, for the copy home (`lib/home-link/voice-copy`). */
export const hunchTakesDesk = desk

let port: ReturnType<typeof patternPort> | null = null

/** The phone's spoken hunches, as topik's shop takes them. */
export function phoneHunchTakes(): ReturnType<typeof patternPort> {
  port ??= patternPort(desk)
  return port
}
