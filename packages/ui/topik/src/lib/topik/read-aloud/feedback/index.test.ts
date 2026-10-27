import { MACHINERY } from "@topik/lib/topik/read-aloud/__tests__/machinery"
import type { ReadAloudFeedback } from "@topik/lib/topik/read-aloud/feedback"
import {
  FEEDBACK_KEYS,
  FEEDBACK_WORDS,
  readFeedback,
  storedFeedback,
  toggled,
} from "@topik/lib/topik/read-aloud/feedback"
import { describe, expect, it } from "vitest"

const AT = "2026-10-21T08:00:00.000Z"
const LATER = "2026-10-21T08:05:00.000Z"

const feedback = (easy: boolean, repeats: boolean): ReadAloudFeedback => ({
  tooEasy: easy ? { at: AT } : null,
  tooManyRepeats: repeats ? { at: AT } : null,
})

describe("the sitting's answers", () => {
  it("gives either, both or neither, and each carries its own date", () => {
    const easy = toggled(null, "tooEasy", AT)
    expect(easy).toEqual(feedback(true, false))
    const both = toggled(easy, "tooManyRepeats", LATER)
    expect(both).toEqual({ tooEasy: { at: AT }, tooManyRepeats: { at: LATER } })
    expect(toggled(both, "tooEasy", LATER)).toEqual({
      tooEasy: null,
      tooManyRepeats: { at: LATER },
    })
    expect(toggled(easy, "tooEasy", LATER)).toBeNull()
  })

  it("parses what it kept, and nothing it cannot trust", () => {
    expect(readFeedback(storedFeedback(feedback(true, true)))).toEqual({
      value: feedback(true, true),
      whole: true,
    })
    expect(storedFeedback(null)).toBeNull()
    for (const bad of [
      { version: 1, tooEasy: { at: "soon" }, tooManyRepeats: null },
      // Neither given is no answer at all.
      { version: 1, tooEasy: null, tooManyRepeats: null },
    ]) {
      expect(readFeedback(bad)?.value ?? null).toBeNull()
    }
  })

  it("says what is kept and what it goes with, and nothing when none is given", () => {
    expect(FEEDBACK_WORDS.saved(feedback(true, false))).toBe(
      "Saved on this phone: Too easy. It goes with your next reflection."
    )
    expect(FEEDBACK_WORDS.saved(feedback(false, true))).toBe(
      "Saved on this phone: Too many repeats. It goes with your next reflection."
    )
    expect(FEEDBACK_WORDS.saved(feedback(true, true))).toBe(
      "Saved on this phone: Too easy and Too many repeats. They go with your next reflection."
    )
    expect(FEEDBACK_WORDS.saved(null)).toBeNull()
    expect(FEEDBACK_WORDS.saved(feedback(false, false))).toBeNull()
  })

  it("never reaches for the machinery's terms", () => {
    expect("a queue of sync grants").toMatch(MACHINERY)
    const words = [
      FEEDBACK_WORDS.group,
      FEEDBACK_WORDS.notKept,
      ...FEEDBACK_KEYS.map(FEEDBACK_WORDS.label),
      ...[feedback(true, false), feedback(false, true), feedback(true, true)]
        .map(FEEDBACK_WORDS.saved)
        .flatMap((line) => line ?? []),
    ]
    for (const line of words) expect(line).not.toMatch(MACHINERY)
  })
})
