/**
 * Every word asking home to hear a take again says (#3339), wherever a take
 * shows it (Takes on home, Takes › Needs your attention), in one pure table,
 * in the person's terms: what is asked, until when it can be asked again,
 * and what came of it. Never the machinery. `__tests__/words.test.ts` holds
 * both.
 */
import { dayAt } from "@soundbites/lib/library/words"

import type { HearAgainAnswer } from "./model"

/** The time of day an ISO time falls at, on this phone's clock: `14:05`. */
const timeAt = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })

export const HEAR_AGAIN_WORDS = {
  ask: "Ask home to try again",
  /** Under the ask, while home was asked too recently. */
  askAgainAt: (iso: string): string =>
    `You can ask again on ${dayAt(iso)} at ${timeAt(iso)}.`,
  /**
   * Under a take home is hearing again, on the owner's ask: what it heard
   * before stays on the take until then (the owner's answer (b),
   * 2026-11-22), and stays if home can't hear it this time either (a).
   */
  hearing: "Being heard again. What home heard before stays here until it has.",
  asking: "Telling home…",
  /** What came of an ask, said over the screen. */
  said: {
    asked:
      "Home will try this take again. What it hears shows here once it has; until then, what it heard before stays.",
    snoozed:
      "Home was asked to try this take again not long ago, so nothing changed. The time you can ask again is under it.",
    settled:
      "Home no longer holds that take, so there is nothing to try again.",
    waiting:
      "Home is still hearing this take for the first time, so nothing changed. Ask again once it has.",
    notTaken: "Home didn't take that just now, so nothing changed. Try again.",
    busy: "This phone was busy with home just then, so nothing changed. Try again in a moment.",
  } satisfies Record<HearAgainAnswer["kind"], string>,
} as const
