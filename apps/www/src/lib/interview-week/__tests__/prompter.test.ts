/**
 * The teleprompter band's step (IW9, #3176) over its whole family: each
 * ordering of heard, quiet, paused and ended reads, and every gap between
 * reads, against the pace the reader set and the hold (C615, C616, C734).
 *
 * PB1 (promise): the band never moves the script back by itself. Family:
 * every place in the script a take can end at (each word read, a line
 * read through, the last word), every way it ends (Stop, the take's cap,
 * leaving the page: each the runtime's `ended`), paused or not, and where a
 * hand left the script's window. Proof: "never moves the script back when
 * a take ends", below, over every half word of the script; and the read's
 * page in `components/jobs/interview/__tests__/interview.test.tsx`, whose
 * window, scrolled by hand, stays where it was when the take stops.
 */
import { HEARD_FLOOR } from "@some-ui/voice-capture"
import { describe, expect, it } from "vitest"

import type { Prompter, PrompterEvent } from "@/lib/interview-week/prompter"
import {
  bandOf,
  DEFAULT_PACE_WPM,
  HOLD_MS,
  NO_PROMPTER,
  PACE_RANGE,
  PACE_STEP_WPM,
  paceOf,
  stepPace,
  stepPrompter,
  totalOf,
} from "@/lib/interview-week/prompter"

const LINE = "2026-w47:conflict"
const LINES = ["On my phone app,", "a dozen screens ask home,", "and wait."]
const TOTAL = totalOf(LINES)
const LOUD = 0.3
const QUIET = 0.01

const heard = (
  at: number,
  level = LOUD,
  answers = LINE,
  pace = DEFAULT_PACE_WPM
): PrompterEvent => ({
  type: "heard",
  answers,
  level,
  at,
  total: TOTAL,
  pace,
})

const run = (events: ReadonlyArray<PrompterEvent>): Prompter =>
  events.reduce(stepPrompter, NO_PROMPTER)

const wordsOf = (state: Prompter): number =>
  state.kind === "reading" ? state.words : Number.NaN

/** Reads every 200 ms, as the recorder measures, from `from` to `to`. */
const reads = (from: number, to: number, level: number): Array<PrompterEvent> =>
  Array.from({ length: (to - from) / 200 + 1 }, (_, i) =>
    heard(from + i * 200, level)
  )

describe("the teleprompter band's step (IW9)", () => {
  it("moves at the pace the reader set while you speak", () => {
    const state = run(reads(0, 1000, LOUD))
    expect(wordsOf(state)).toBeCloseTo((1000 * DEFAULT_PACE_WPM) / 60_000)
    const slow = PACE_RANGE.least
    const set = run([heard(0, LOUD, LINE, slow), heard(200, LOUD, LINE, slow)])
    expect(wordsOf(set)).toBeCloseTo((200 * slow) / 60_000)
  })

  it("steps the pace a step at a time, within its range (C734)", () => {
    expect(stepPace(DEFAULT_PACE_WPM, "faster")).toBe(
      DEFAULT_PACE_WPM + PACE_STEP_WPM
    )
    expect(stepPace(DEFAULT_PACE_WPM, "slower")).toBe(
      DEFAULT_PACE_WPM - PACE_STEP_WPM
    )
    expect(stepPace(PACE_RANGE.most, "faster")).toBe(PACE_RANGE.most)
    expect(stepPace(PACE_RANGE.least, "slower")).toBe(PACE_RANGE.least)
    // A kept pace off the steps, or out of range, lines up again.
    expect([175, 170.5, 40, 900, DEFAULT_PACE_WPM].map(paceOf)).toEqual([
      170,
      170,
      PACE_RANGE.least,
      PACE_RANGE.most,
      DEFAULT_PACE_WPM,
    ])
  })

  it("never moves before the voice is first heard, and says it waits for it", () => {
    const quiet = run(reads(0, 3000, QUIET))
    expect(wordsOf(quiet)).toBe(0)
    expect(bandOf(quiet, LINE, LINES).state).toBe("waiting")
  })

  it("holds once the voice has been quiet past the hold, and moves again when heard", () => {
    const spoke = run(reads(0, 1000, LOUD))
    const quiet = [...reads(1200, 1000 + HOLD_MS, QUIET)].reduce(
      stepPrompter,
      spoke
    )
    const held = [...reads(1000 + HOLD_MS + 200, 6000, QUIET)].reduce(
      stepPrompter,
      quiet
    )
    expect(wordsOf(held)).toBe(wordsOf(quiet))
    expect(bandOf(held, LINE, LINES).state).toBe("holding")
    const again = stepPrompter(held, heard(6200))
    expect(bandOf(again, LINE, LINES).state).toBe("moving")
  })

  it("counts the level at the floor as heard, and below it as quiet", () => {
    const at = run([heard(0, HEARD_FLOOR), heard(200, HEARD_FLOOR)])
    expect(wordsOf(at)).toBeGreaterThan(0)
    // The quiet before a first word is never read through.
    const first = run([heard(0, HEARD_FLOOR - 0.01), heard(200, LOUD)])
    expect(wordsOf(first)).toBe(0)
    expect(wordsOf(stepPrompter(first, heard(400, LOUD)))).toBeGreaterThan(0)
    expect(
      wordsOf(run([heard(0, HEARD_FLOOR - 0.01), heard(200, QUIET)]))
    ).toBe(0)
  })

  it("holds while paused, the take still heard, and goes on from where it was", () => {
    const spoke = run(reads(0, 1000, LOUD))
    const paused = [
      { type: "pause" } as const,
      ...reads(1200, 4000, LOUD),
    ].reduce(stepPrompter, spoke)
    expect(wordsOf(paused)).toBe(wordsOf(spoke))
    expect(bandOf(paused, LINE, LINES).state).toBe("paused")
    const goneOn = [{ type: "pause" } as const, heard(4200)].reduce(
      stepPrompter,
      paused
    )
    expect(wordsOf(goneOn)).toBeGreaterThan(wordsOf(spoke))
  })

  it("never jumps across a gap between reads", () => {
    // A phone that slept a minute mid-take: the minute wasn't spoken through.
    expect(wordsOf(run([heard(0), heard(60_000)]))).toBe(0)
    // A clock that runs back moves nothing.
    expect(wordsOf(run([heard(1000), heard(500)]))).toBe(0)
  })

  it("stops at the script's last word, on the last line", () => {
    const state = run(reads(0, 60_000, LOUD))
    expect(wordsOf(state)).toBe(TOTAL)
    expect(bandOf(state, LINE, LINES)).toEqual({
      line: LINES.length - 1,
      state: "holding",
    })
  })

  it("starts each take from the top: another line, or a new take after one ended", () => {
    const spoke = run(reads(0, 2000, LOUD))
    expect(
      wordsOf(stepPrompter(spoke, heard(2200, LOUD, "2026-w47:other")))
    ).toBe(0)
    expect(
      wordsOf(
        [{ type: "ended" } as const, heard(2400)].reduce(stepPrompter, spoke)
      )
    ).toBe(0)
    // Nothing to pause or end while no take is under way.
    expect(stepPrompter(NO_PROMPTER, { type: "pause" })).toBe(NO_PROMPTER)
    expect(stepPrompter(NO_PROMPTER, { type: "ended" })).toBe(NO_PROMPTER)
  })

  it("never moves the script back when a take ends, wherever it ends (PB1)", () => {
    for (let words = 0; words <= TOTAL; words += 0.5)
      for (const paused of [false, true]) {
        const reading: Prompter = {
          kind: "reading",
          answers: LINE,
          words,
          at: 0,
          heardAt: 0,
          paused,
        }
        const ended = stepPrompter(reading, { type: "ended" })
        const at = `${words} words${paused ? ", paused" : ""}`
        expect(bandOf(ended, LINE, LINES).line, at).toBe(
          bandOf(reading, LINE, LINES).line
        )
        // It stays there as the runtime keeps saying no take is under way,
        // and a pause tapped then changes nothing.
        const later = [
          { type: "ended" } as const,
          { type: "pause" } as const,
        ].reduce(stepPrompter, ended)
        expect(later, at).toBe(ended)
        expect(bandOf(later, LINE, LINES).state).toBe("holding")
      }
  })

  it("lights the line whose words the band is among", () => {
    const at = (words: number): number =>
      bandOf(
        {
          kind: "reading",
          answers: LINE,
          words,
          at: 0,
          heardAt: 0,
          paused: false,
        },
        LINE,
        LINES
      ).line
    expect([0, 3.9, 4, 8.9, 9, 11].map(at)).toEqual([0, 0, 1, 1, 2, 2])
    // Another take's band, or none, shows the first line.
    expect(bandOf(NO_PROMPTER, LINE, LINES)).toEqual({
      line: 0,
      state: "holding",
    })
    expect(bandOf(run([heard(0)]), "2026-w47:other", LINES).line).toBe(0)
  })
})
