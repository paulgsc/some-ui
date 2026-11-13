/** @vitest-environment node */
import { describe, expect, it } from "vitest"

import type { MoveRefused, TakeStation } from "@/lib/take-conveyor/model"
import { TAKE_STATIONS } from "@/lib/take-conveyor/model"
import { TAKE_CONVEYOR_WORDS } from "@/lib/take-conveyor/words"

/**
 * What the person must never be told in: how it works, not what it does
 * (CLAUDE.md, "State in the person's terms"), with the conveyor's own
 * machinery: its station ids, the move's id, the queue it waits in.
 */
const MACHINERY =
  /\b(grant|consent|scope|sync\w*|server|request|response|status|error|api|https?|token|queue\w*|retry|null|undefined|database|store|ref|id|state|owed|stale|picked-up|in-the-oven|ready-for-pickup|uuid|404|409|422)\b/i

const AT = "2026-11-13T09:00:00.000Z"

/** Every word the table says: each fixed one, and each a maker makes. */
function everyWord(): Array<string> {
  const { stations, means, standing, refused, ...fixed } = TAKE_CONVEYOR_WORDS
  return [
    ...Object.values(fixed),
    ...Object.values(stations),
    ...Object.values(means),
    ...Object.values(refused),
    ...TAKE_STATIONS.flatMap((station) => [
      standing({ station, at: null, going: false, missed: null }),
      standing({ station, at: AT, going: false, missed: null }),
      standing({ station, at: AT, going: true, missed: null }),
      standing({
        station,
        at: AT,
        going: false,
        missed: { to: station, why: "stale" },
      }),
      standing({
        station,
        at: null,
        going: false,
        missed: { to: station, why: "refused" },
      }),
    ]),
  ]
}

describe("TAKE_CONVEYOR_WORDS", () => {
  it("names each station with the owner's pizza names (ask #2876)", () => {
    expect(TAKE_CONVEYOR_WORDS.stations).toEqual({
      "in-the-oven": "In the oven",
      cooking: "Cooking",
      "ready-for-pickup": "Ready for pickup",
      "picked-up": "Picked up",
      canned: "Canned",
    } satisfies Record<TakeStation, string>)
  })

  it.each(everyWord())("says %j in the person's terms", (words) => {
    expect(words).not.toMatch(MACHINERY)
    expect(words.trim()).not.toBe("")
  })

  it("says since when a take stands where it is, when home hasn't heard, and a move it didn't keep", () => {
    const { standing } = TAKE_CONVEYOR_WORDS
    const none = { going: false, missed: null }
    expect(standing({ station: "in-the-oven", at: null, ...none })).toBe(
      "In the oven"
    )
    expect(standing({ station: "cooking", at: AT, ...none })).toMatch(
      /^Cooking since /
    )
    expect(
      standing({
        station: "ready-for-pickup",
        at: AT,
        going: true,
        missed: null,
      })
    ).toBe("Ready for pickup. Home hears of it once it's in reach.")
    expect(
      standing({
        station: "in-the-oven",
        at: null,
        going: false,
        missed: { to: "ready-for-pickup", why: "stale" },
      })
    ).toBe(
      "In the oven. Your move to Ready for pickup wasn't made: it had already moved on."
    )
  })

  it("says why each refused move wasn't made", () => {
    const why: ReadonlyArray<MoveRefused> = [
      "here",
      "pickup",
      "final",
      "oven",
      "labels",
      "comment",
    ]
    for (const reason of why) {
      expect(TAKE_CONVEYOR_WORDS.refused[reason]).toMatch(/\.$/)
    }
  })
})
