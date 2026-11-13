import {
  measureRead,
  READ_PAUSE_MS,
  ReadFaultsSchema,
  ReadTakeSchema,
  type HeardWord,
  type ReadFaults,
} from "@interview-week/lib/faults"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { joined, said } from "./fixture"

function measure(words: Array<HeardWord>, script: string): ReadFaults {
  return ReadFaultsSchema.parse(measureRead({ words, script }))
}

const SCRIPT = "I built this to keep the record. Nothing is lost, ever."

describe("measureRead", () => {
  it("finds no misread in a read word for word", () => {
    const faults = measure(said(SCRIPT, { atMs: 800 }), SCRIPT)
    expect(faults.misread).toEqual({
      skipped: 0,
      substituted: 0,
      repeated: 0,
      inserted: 0,
      fillers: 0,
    })
    expect(faults.script).toEqual({ words: 11, breaks: 2 })
    expect(faults.leadInMs).toBe(800)
  })

  it("compares words, not their case, punctuation or apostrophes", () => {
    const faults = measure(
      said("dont stop, its WELL known"),
      "Don’t stop; it's well-known."
    )
    expect(faults.misread.substituted + faults.misread.skipped).toBe(0)
  })

  it.each([
    {
      name: "a skipped word",
      read: "I built this to keep record. Nothing is lost, ever.",
      want: {
        skipped: 1,
        substituted: 0,
        repeated: 0,
        inserted: 0,
        fillers: 0,
      },
    },
    {
      name: "a substituted word",
      read: "I built this to keep a record. Nothing is lost, ever.",
      want: {
        skipped: 0,
        substituted: 1,
        repeated: 0,
        inserted: 0,
        fillers: 0,
      },
    },
    {
      name: "a repeated word",
      read: "I built this to to keep the record. Nothing is lost, ever.",
      want: {
        skipped: 0,
        substituted: 0,
        repeated: 1,
        inserted: 0,
        fillers: 0,
      },
    },
    {
      name: "a restart of a phrase",
      read: "I built I built this to keep the record. Nothing is lost, ever.",
      want: {
        skipped: 0,
        substituted: 0,
        repeated: 2,
        inserted: 0,
        fillers: 0,
      },
    },
    {
      name: "a filler, which is an inserted word",
      read: "I built this to um keep the record. Nothing is lost, ever.",
      want: {
        skipped: 0,
        substituted: 0,
        repeated: 0,
        inserted: 1,
        fillers: 1,
      },
    },
    {
      name: "an added word",
      read: "I built this to really keep the record. Nothing is lost, ever.",
      want: {
        skipped: 0,
        substituted: 0,
        repeated: 0,
        inserted: 1,
        fillers: 0,
      },
    },
  ])("counts $name", ({ read, want }) => {
    expect(measure(said(read), SCRIPT).misread).toEqual(want)
  })

  it("places a pause at a full stop as phrasing and one inside a phrase as a stumble", () => {
    const pause = READ_PAUSE_MS
    const words = joined(
      said("I built this to", { atMs: 0 }), // ends 1500
      said("keep the record.", { atMs: 1500 + pause }), // ends 2700 + pause
      said("Nothing is lost, ever.", { atMs: 2700 + 2 * pause + 300 })
    )
    const faults = measure(words, SCRIPT)
    expect(faults.pauses).toEqual({
      atBreak: 1,
      midPhrase: 1,
      longestMidPhraseMs: pause,
    })
  })

  it("counts no pause just under the threshold", () => {
    const words = joined(
      said("I built this to", { atMs: 0 }),
      said("keep the record. Nothing is lost, ever.", {
        atMs: 1500 + READ_PAUSE_MS - 1,
      })
    )
    expect(measure(words, SCRIPT).pauses).toEqual({
      atBreak: 0,
      midPhrase: 0,
      longestMidPhraseMs: null,
    })
  })

  it("takes a pause after a filler at a break as phrasing", () => {
    const words = joined(
      said("I built this to keep the record. um", { atMs: 0 }), // ends 3100
      said("Nothing is lost, ever.", { atMs: 3100 + READ_PAUSE_MS })
    )
    expect(measure(words, SCRIPT).pauses.atBreak).toBe(1)
  })

  it("finds no variation in a read at one even pace, and some in an uneven one", () => {
    const script = "one two three. four five six. seven eight nine."
    expect(measure(said(script), script).pace).toEqual({
      // Nine words from 0 to 3500 ms.
      wpm: (9 * 60_000) / 3500,
      phrases: 3,
      variation: 0,
    })
    const uneven = joined(
      said("one two three.", { atMs: 0 }),
      said("four five six.", { atMs: 2000, durMs: 600 }),
      said("seven eight nine.", { atMs: 6000 })
    )
    expect(measure(uneven, script).pace.variation).toBeGreaterThan(0.1)
  })

  it("does not time a phrase too short to give a rate", () => {
    const script = "Yes. one two three."
    expect(measure(said(script), script).pace.phrases).toBe(1)
  })

  it("measures nothing in a read with no words", () => {
    expect(measure([], SCRIPT)).toEqual({
      words: 0,
      script: { words: 11, breaks: 2 },
      misread: {
        skipped: 11,
        substituted: 0,
        repeated: 0,
        inserted: 0,
        fillers: 0,
      },
      pauses: { atBreak: 0, midPhrase: 0, longestMidPhraseMs: null },
      pace: { wpm: null, phrases: 0, variation: null },
      leadInMs: null,
    })
  })

  it("reads one word against its one-word script", () => {
    const faults = measure(
      [{ text: "Hello", startMs: 400, endMs: 700 }],
      "Hello."
    )
    expect(faults.misread.skipped + faults.misread.substituted).toBe(0)
    expect(faults.script).toEqual({ words: 1, breaks: 0 })
    expect(faults.leadInMs).toBe(400)
  })

  it("counts a read of fillers only as fillers inserted and every script word skipped", () => {
    const faults = measure(said("um uh"), "Go now.")
    expect(faults.misread).toEqual({
      skipped: 2,
      substituted: 0,
      repeated: 0,
      inserted: 2,
      fillers: 2,
    })
    expect(faults.pace.wpm).toBe(0)
  })

  it("refuses a script longer than a read", () => {
    const script = "word ".repeat(2001)
    expect(ReadTakeSchema.safeParse({ words: [], script }).success).toBe(false)
  })
})

const scriptWord = fc.constantFrom(
  "the",
  "record",
  "stays",
  "home",
  "and",
  "grows"
)
const punctuation = fc.constantFrom(" ", " ", ", ", ". ", "\n")

describe("measureRead over any read", () => {
  it("accounts for every script word, and finds no misread in a read of the script", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(scriptWord, punctuation), {
          minLength: 1,
          maxLength: 40,
        }),
        fc.array(fc.constantFrom("the", "um", "home", "grows", "late"), {
          maxLength: 40,
        }),
        (parts, other) => {
          const script = parts.map(([word, gap]) => word + gap).join("")
          const exact = measure(
            said(parts.map(([word]) => word).join(" ")),
            script
          )
          expect(exact.misread).toEqual({
            skipped: 0,
            substituted: 0,
            repeated: 0,
            inserted: 0,
            fillers: 0,
          })
          const faults = measure(said(other.join(" ")), script)
          const { skipped, substituted, repeated, inserted, fillers } =
            faults.misread
          // Every script word is read, substituted or skipped; every heard
          // word reads one, or was added.
          const read = faults.script.words - skipped
          expect(read).toBeGreaterThanOrEqual(substituted)
          expect(read + repeated + inserted).toBe(faults.words)
          expect(fillers).toBeLessThanOrEqual(inserted)
        }
      )
    )
  })
})
