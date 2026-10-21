import {
  FEEDBACK_WORDS,
  parseFeedback,
  storedFeedback,
  toggled,
} from "@topik/lib/topik/read-aloud/feedback"
import type { ReadAloudFeedback } from "@topik/lib/topik/read-aloud/feedback"
import { describe, expect, it } from "vitest"

const AT = "2026-10-21T08:00:00.000Z"
const LATER = "2026-10-21T08:05:00.000Z"

/** What the person must never be told in: how it works, not what it did. */
const MACHINERY =
  /\b(queue|deck|pool|draw\w*|seed|state|store\w*|storage|key|id|null|undefined|json|export\w*|field|flag|boolean|level moves?|request|status|error)\b/i

describe("the sitting's answers", () => {
  it("gives either, both or neither, and a second tap takes one back", () => {
    const easy = toggled(null, "tooEasy", AT)
    expect(easy).toEqual({
      tooEasy: true,
      tooManyRepeats: false,
      answeredAt: AT,
    })
    const both = toggled(easy, "tooManyRepeats", LATER)
    expect(both).toEqual({
      tooEasy: true,
      tooManyRepeats: true,
      answeredAt: LATER,
    })
    expect(toggled(both, "tooEasy", AT)).toMatchObject({
      tooEasy: false,
      tooManyRepeats: true,
    })
    expect(
      toggled(toggled(both, "tooEasy", AT), "tooManyRepeats", AT)
    ).toBeNull()
    expect(toggled(easy, "tooEasy", AT)).toBeNull()
  })

  it("keeps what it parses, and parses nothing it cannot trust", () => {
    const both: ReadAloudFeedback = {
      tooEasy: true,
      tooManyRepeats: true,
      answeredAt: AT,
    }
    expect(parseFeedback(storedFeedback(both))).toEqual(both)
    expect(storedFeedback(null)).toBeNull()
    for (const bad of [
      null,
      "{}",
      { version: 2, tooEasy: true, tooManyRepeats: false, answeredAt: AT },
      { version: 1, tooEasy: "yes", tooManyRepeats: false, answeredAt: AT },
      { version: 1, tooEasy: true, tooManyRepeats: false, answeredAt: "soon" },
      // Neither given is no answer at all.
      { version: 1, tooEasy: false, tooManyRepeats: false, answeredAt: AT },
    ]) {
      expect(parseFeedback(bad)).toBeNull()
    }
  })

  it("says what is kept, where, and what it goes with", () => {
    const given = (tooEasy: boolean, tooManyRepeats: boolean): string | null =>
      FEEDBACK_WORDS.saved({ tooEasy, tooManyRepeats, answeredAt: AT })
    expect(given(true, false)).toBe(
      "Saved on this phone: Too easy. It goes with your next reflection."
    )
    expect(given(false, true)).toBe(
      "Saved on this phone: Too many repeats. It goes with your next reflection."
    )
    expect(given(true, true)).toBe(
      "Saved on this phone: Too easy and Too many repeats. They go with your next reflection."
    )
    expect(FEEDBACK_WORDS.saved(null)).toBeNull()
  })

  it("never reaches for the machinery's terms", () => {
    const words = [
      FEEDBACK_WORDS.group,
      FEEDBACK_WORDS.label("tooEasy"),
      FEEDBACK_WORDS.label("tooManyRepeats"),
      ...[
        [true, false],
        [false, true],
        [true, true],
      ].flatMap(
        ([tooEasy, tooManyRepeats]) =>
          FEEDBACK_WORDS.saved({
            tooEasy: tooEasy === true,
            tooManyRepeats: tooManyRepeats === true,
            answeredAt: AT,
          }) ?? []
      ),
    ]
    for (const line of words) expect(line).not.toMatch(MACHINERY)
  })
})
