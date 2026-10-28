/**
 * What of the game bites is still only on this phone (`../voice`): a
 * bite the phone could not keep yet is counted, a bite waits until home
 * holds it, and one home refused stays and is counted apart, never as gone.
 */
import { describe, expect, it } from "vitest"

import { outboxView } from "@/lib/home-link/voice"
import { INITIAL_VOICE_HOME } from "@/lib/voice-home/model"

describe("outboxView", () => {
  it("counts each bite not kept yet, each home doesn't hold as waiting, and each it refused apart", () => {
    const home = {
      ...INITIAL_VOICE_HOME,
      held: ["b1", "n9"],
      refused: [
        { id: "b3", why: "home holds another recording under its name" },
      ],
    }
    expect(outboxView(1, ["b1", "b2", "b3", "b4"], home, true)).toEqual({
      notKept: 1,
      waiting: 2,
      refused: 1,
      sending: true,
    })
    expect(outboxView(0, [], INITIAL_VOICE_HOME, false)).toEqual({
      notKept: 0,
      waiting: 0,
      refused: 0,
      sending: false,
    })
  })
})
