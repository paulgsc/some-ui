import {
  ANSWER_PAUSE_MS,
  AnswerFaultsSchema,
  measureAnswer,
  MUMBLE_P,
  type AnswerFaults,
  type HeardWord,
} from "@interview-week/lib/faults"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { joined, said } from "./fixture"

const TARGET = 60_000

function measure(
  words: Array<HeardWord>,
  takeMs: number | null = null
): AnswerFaults {
  return AnswerFaultsSchema.parse(
    measureAnswer({ words, targetMs: TARGET, takeMs })
  )
}

describe("measureAnswer", () => {
  it("measures nothing in a take with no words", () => {
    expect(measure([], 5000)).toEqual({
      words: 0,
      fillers: { count: 0, perMinute: null },
      pauses: { count: 0, longestMs: null, leadingMs: null, trailingMs: null },
      mumbled: { count: 0, share: null },
      pace: { wpm: null },
      length: { spokenMs: 0, targetMs: TARGET, over: false, overMs: 0 },
    })
  })

  it("times one word, with no gap between words to be a pause", () => {
    const faults = measure(
      [{ text: "Hello.", startMs: 1200, endMs: 1500, p: 0.9 }],
      4000
    )
    expect(faults.words).toBe(1)
    expect(faults.pauses).toEqual({
      count: 0,
      longestMs: null,
      leadingMs: 1200,
      trailingMs: 2500,
    })
    expect(faults.pace.wpm).toBe(200)
    expect(faults.length.spokenMs).toBe(300)
  })

  it("counts a take of fillers only as fillers, with no pace", () => {
    const faults = measure(said("Um, uh... hmm. Erm"))
    expect(faults.fillers.count).toBe(4)
    expect(faults.words).toBe(4)
    expect(faults.pace.wpm).toBe(0)
    // 4 fillers over 1.5 s of speech.
    expect(faults.fillers.perMinute).toBe(160)
  })

  it("counts a word that only contains a filler as no filler", () => {
    expect(measure(said("umbrella human")).fillers.count).toBe(0)
  })

  it.each([
    { gap: ANSWER_PAUSE_MS - 1, pauses: 0 },
    { gap: ANSWER_PAUSE_MS, pauses: 1 },
    { gap: ANSWER_PAUSE_MS + 1, pauses: 1 },
  ])("a gap of $gap ms is $pauses pause(s)", ({ gap, pauses }) => {
    const words = joined(
      said("I led it", { atMs: 0 }),
      said("and shipped", { atMs: 1100 + gap })
    )
    const faults = measure(words)
    expect(faults.pauses.count).toBe(pauses)
    expect(faults.pauses.longestMs).toBe(gap)
  })

  it("never counts the silence before the first word or after the last as a pause", () => {
    const faults = measure(said("so we", { atMs: 9000 }), 20_000)
    expect(faults.pauses.count).toBe(0)
    expect(faults.pauses.leadingMs).toBe(9000)
    expect(faults.pauses.trailingMs).toBe(20_000 - 9700)
  })

  it("counts every word mumbled when p is low throughout", () => {
    const faults = measure(said("we did the thing", { p: MUMBLE_P - 0.01 }))
    expect(faults.mumbled).toEqual({ count: 4, share: 1 })
  })

  it("counts a word at exactly the threshold as heard", () => {
    expect(measure(said("we did", { p: MUMBLE_P })).mumbled.count).toBe(0)
  })

  it("leaves words without p out of the mumbled share", () => {
    const words = joined(
      said("one", { p: 0.1 }),
      said("two three", { atMs: 1000 })
    )
    expect(measure(words).mumbled).toEqual({ count: 1, share: 1 })
  })

  it("marks an answer over its target and by how much", () => {
    const faults = AnswerFaultsSchema.parse(
      measureAnswer({
        words: [
          { text: "start", startMs: 0, endMs: 300 },
          { text: "end", startMs: 2000, endMs: 2500 },
        ],
        targetMs: 2000,
        takeMs: null,
      })
    )
    expect(faults.length).toEqual({
      spokenMs: 2500,
      targetMs: 2000,
      over: true,
      overMs: 500,
    })
  })

  it("leaves no gap between words that overlap", () => {
    const faults = measure([
      { text: "a", startMs: 0, endMs: 1000 },
      { text: "b", startMs: 500, endMs: 800 },
      { text: "c", startMs: 900, endMs: 1200 },
    ])
    expect(faults.pauses.longestMs).toBe(0)
    expect(faults.length.spokenMs).toBe(1200)
  })

  it("refuses a take with times that are not whole milliseconds", () => {
    expect(() =>
      measureAnswer({
        words: [{ text: "a", startMs: 0.5, endMs: 10 }],
        targetMs: TARGET,
        takeMs: null,
      })
    ).toThrow()
  })

  it("ignores a heard word that is punctuation alone", () => {
    expect(measure([{ text: " ...", startMs: 0, endMs: 10 }]).words).toBe(0)
  })
})

const word = fc
  .record({
    text: fc.constantFrom(
      "um",
      "Uh,",
      "we",
      "shipped",
      "it.",
      "well-known",
      "—"
    ),
    startMs: fc.nat(120_000),
    durMs: fc.nat(2000),
    p: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), {
      nil: undefined,
    }),
  })
  .map(({ text, startMs, durMs, p }) => ({
    text,
    startMs,
    endMs: startMs + durMs,
    ...(p === undefined ? {} : { p }),
  }))

describe("measureAnswer over any take", () => {
  it("gives a record the schema holds, whatever order the words come in", () => {
    fc.assert(
      fc.property(
        fc.array(word, { maxLength: 60 }),
        fc.option(fc.nat(200_000), { nil: null }),
        (words, takeMs) => {
          const faults = measure(words, takeMs)
          expect(measure([...words].reverse(), takeMs)).toEqual(faults)
          expect(faults.fillers.count).toBeLessThanOrEqual(faults.words)
          expect(faults.mumbled.count).toBeLessThanOrEqual(faults.words)
          expect(faults.pauses.count).toBeLessThanOrEqual(
            Math.max(0, faults.words - 1)
          )
        }
      )
    )
  })
})
