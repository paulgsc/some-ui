/**
 * A question's ladder as pure steps (IW8, #3175): the rungs a question
 * offers, the script read aloud, a take marked with the rung it was asked
 * for, and only each question's first take let go home on its own.
 */
import type { PatternTake } from "@some-ui/voice-capture"
import { describe, expect, it } from "vitest"

import {
  ask,
  firsts,
  markRung,
  NO_LADDER,
  scriptOf,
  stepsOf,
} from "@/lib/interview-week/ladder"

import { WEEK, WEEK_2 } from "./fixture"

const take = (
  id: string,
  answers: string,
  recordedAt: string,
  waits = true
): PatternTake => ({
  id,
  answers,
  recordedAt,
  durationMs: 1_000,
  standing: "current",
  kept: { place: "phone" },
  ...(waits ? { waits: true as const } : {}),
})

describe("a question's ladder (IW8)", () => {
  it("offers all four rungs with a ready answer, the last two without", () => {
    expect(stepsOf(WEEK_2.questions[0])).toEqual([
      "study",
      "aloud",
      "cues",
      "own",
    ])
    expect(stepsOf(WEEK.questions[0])).toEqual(["cues", "own"])
  })

  it("reads the answer aloud a clause a line, in order", () => {
    expect(
      scriptOf({
        answer: [
          { label: "a", text: "One, two.  Three?", note: "n", sources: [] },
          { label: "b", text: "Four", note: "n", sources: [] },
        ],
      })
    ).toEqual(["One,", "two.", "Three?", "Four"])
  })

  it("marks the take kept since a rung asked for it, and only that one", () => {
    const takes = [
      take("old", "2026-w47:conflict", "2026-11-16T10:00:00Z"),
      take("new", "2026-w47:conflict", "2026-11-17T10:00:00Z"),
      take("other", "2026-w47:why-now", "2026-11-17T10:00:00Z"),
    ]
    const asking = ask(NO_LADDER, {
      item: "conflict",
      rung: "cues",
      before: ["old"],
    })
    expect(markRung(asking, takes.slice(0, 1), "2026-w47")).toBe(asking)
    expect(markRung(asking, takes, "2026-w47")).toEqual({
      first: {},
      rungs: { new: "cues" },
    })
    expect(ask(asking, null)).toEqual(NO_LADDER)
  })

  it("lets each question's earliest take go home, never a later one", () => {
    const week = "2026-w47"
    const takes = [
      take("second", `${week}:conflict`, "2026-11-17T10:00:00Z"),
      take("first", `${week}:conflict`, "2026-11-16T10:00:00Z"),
      take("read", `${week}:read:epic-2931`, "2026-11-16T09:00:00Z"),
    ]
    const items = ["conflict", "why-now"]
    const once = firsts(NO_LADDER, takes, week, items)
    expect(once).toEqual({
      ladder: { first: { conflict: "first" }, rungs: {} },
      release: ["first"],
    })
    // Once gone, nothing more goes, and the marks stand as they are.
    const gone = takes.map((t) =>
      t.id === "first" ? take("first", t.answers, t.recordedAt, false) : t
    )
    const again = firsts(once.ladder, gone, week, items)
    expect(again.ladder).toBe(once.ladder)
    expect(again.release).toEqual([])
  })
})
