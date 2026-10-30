/**
 * What of the game bites is still only on this phone (`../voice`): a
 * bite the phone could not keep yet is counted, a bite waits until home
 * holds it, one home refused stays and is counted apart, never as gone, and
 * one home holds is counted as kept there, since the first such (#2080).
 */
import { describe, expect, it } from "vitest"

import type { PhoneBite } from "@/lib/game-bites/model"
import { outboxView } from "@/lib/home-link/voice"
import { INITIAL_VOICE_HOME } from "@/lib/voice-home/model"

const bite = (id: string, homeSince?: number): PhoneBite => ({
  id,
  gameId: "401772981",
  at: "2026-11-01T21:00:00.000Z",
  contentType: "audio/webm",
  durationMs: 4_000,
  fields: {},
  holdUntil: 0,
  ...(homeSince === undefined ? {} : { homeSince }),
})

describe("outboxView", () => {
  it("counts each bite not kept yet, each home doesn't hold as waiting, and each it refused apart", () => {
    const home = {
      ...INITIAL_VOICE_HOME,
      held: ["b1", "n9"],
      refused: [
        { id: "b3", why: "home holds another recording under its name" },
      ],
    }
    expect(
      outboxView(
        1,
        [bite("b1", 300), bite("b2"), bite("b3"), bite("b4")],
        home,
        true
      )
    ).toEqual({
      notKept: 1,
      waiting: 2,
      refused: 1,
      sending: true,
      onHome: 1,
      onHomeSince: 300,
    })
    expect(outboxView(0, [], INITIAL_VOICE_HOME, false)).toEqual({
      notKept: 0,
      waiting: 0,
      refused: 0,
      sending: false,
      onHome: 0,
      onHomeSince: null,
    })
  })
})
