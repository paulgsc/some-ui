import { TALLOWBROOK_WEEK_FILE } from "@rust-rounds/lib/sample-week/tallowbrook"
import { readWeek } from "@rust-rounds/lib/week-check"
import { conversationProblems } from "@some-ui/video-render"
import { describe, expect, it } from "vitest"

import { openingOfWeek, STANDING_OPENING } from "."

describe("the standing opening (#3269, C737)", () => {
  it("holds to a conversation opening's words", () => {
    expect(
      conversationProblems(STANDING_OPENING.exchanges, "opening.exchanges")
    ).toEqual([])
  })

  it("goes into a /2 week as it stands, and the week reads", () => {
    const week = { ...TALLOWBROOK_WEEK_FILE, opening: openingOfWeek() }
    expect(readWeek(week)).toEqual({ ok: true, week })
    expect(week.opening).toEqual(STANDING_OPENING)
    expect(week.opening).not.toBe(STANDING_OPENING)
  })
})
