/**
 * The interview week's spec (IW5) and a read's cue: the items, IW1's refs, the
 * record Send keeps in home's shape, and the cue's countdown.
 */
import { describe, expect, it } from "vitest"

import { CUE_SECONDS, NO_CUE, stepCue } from "@/lib/interview-week/cue"
import type { InterviewSent } from "@/lib/interview-week/spec"
import {
  cardOf,
  interviewAtHome,
  interviewMachine,
  isClosed,
  itemsOf,
  readItem,
  sentTakeOf,
  takeLine,
} from "@/lib/interview-week/spec"

import { WEEK } from "./fixture"

describe("the interview week's items (IW5)", () => {
  it("are the questions, then a read per card, never meeting", () => {
    expect(itemsOf(WEEK)).toEqual([
      "walk-me-through",
      "conflict",
      "why-now",
      "decision-c266",
      "read:epic-2931",
      "read:invariant-rs1",
    ])
    expect(cardOf("read:epic-2931")).toBe("epic-2931")
    expect(cardOf("conflict")).toBeNull()
  })

  it("name a take by IW1's refs: an answer and a read", () => {
    expect(takeLine(WEEK.id, "conflict")).toBe("2026-w47:conflict")
    expect(takeLine(WEEK.id, readItem("epic-2931"))).toBe(
      "2026-w47:read:epic-2931"
    )
  })

  it("close after the deadline only", () => {
    expect(isClosed(WEEK, "2026-11-23T07:59:00.000Z")).toBe(false)
    expect(isClosed(WEEK, "2026-11-23T08:00:00.000Z")).toBe(true)
  })
})

describe("the record Send keeps", () => {
  const spec = interviewMachine(WEEK).spec
  const draft = spec.fresh(WEEK.id, "2026-11-17T09:00:00.000Z", null)
  const take = (id: string): { id: string; at: string } => ({
    id,
    at: "2026-11-17T10:00:00.000Z",
  })

  it("splits answers from reads and names every card once", () => {
    const sent = spec.record(
      draft,
      [
        { item: "conflict", take: take("t1"), typed: null },
        { item: "read:invariant-rs1", take: take("t2"), typed: null },
      ],
      [],
      "2026-11-17T11:00:00.000Z",
      null
    )
    expect(sent).toEqual({
      week: "2026-w47",
      at: "2026-11-17T11:00:00.000Z",
      answers: [
        {
          question: "conflict",
          take: "t1",
          recordedAt: "2026-11-17T10:00:00.000Z",
        },
      ],
      reads: [
        {
          card: "invariant-rs1",
          take: "t2",
          recordedAt: "2026-11-17T10:00:00.000Z",
        },
      ],
      passed: ["walk-me-through", "why-now", "decision-c266"],
      passedReads: ["epic-2931"],
    } satisfies InterviewSent)
    expect(spec.named(sent)).toEqual(["t1", "t2"])
  })

  it("sends again what home holds of a card not said since", () => {
    const last: InterviewSent = {
      week: WEEK.id,
      at: "2026-11-17T11:00:00.000Z",
      answers: [
        { question: "conflict", take: "t1", recordedAt: "2026-11-17T10:00Z" },
      ],
      reads: [
        { card: "epic-2931", take: "t2", recordedAt: "2026-11-17T10:00Z" },
      ],
      passed: [],
      passedReads: [],
    }
    const again = spec.record(
      draft,
      [{ item: "why-now", take: take("t3"), typed: null }],
      [],
      "2026-11-18T11:00:00.000Z",
      last
    )
    expect(again.answers.map(({ take: t }) => t)).toEqual(["t1", "t3"])
    expect(again.reads.map(({ take: t }) => t)).toEqual(["t2"])
    expect(again.passed).toEqual(["walk-me-through", "decision-c266"])
    expect(sentTakeOf(again, "read:epic-2931")).toBe("t2")
    expect(sentTakeOf(again, "walk-me-through")).toBeNull()
  })

  it("says what home holds: its latest held, and the latest made", () => {
    const at = (when: string): InterviewSent => ({
      week: WEEK.id,
      at: when,
      answers: [],
      reads: [],
      passed: [],
      passedReads: [],
    })
    const sends = [at("2026-11-17T00:00Z"), at("2026-11-18T00:00Z")]
    const home = interviewAtHome(sends, WEEK, (sent) => sent === sends[0])
    expect(home.holds).toBe(sends[0])
    expect(home.last).toBe(sends[1])
  })
})

describe("a read's cue (C397)", () => {
  it("counts down, then starts the take", () => {
    let step = stepCue(NO_CUE, { type: "start", item: "read:epic-2931" })
    expect(step.cue).toEqual({
      kind: "counting",
      item: "read:epic-2931",
      left: CUE_SECONDS,
    })
    const goes: Array<string | null> = []
    for (let second = 0; second < CUE_SECONDS; second += 1) {
      step = stepCue(step.cue, { type: "tick" })
      goes.push(step.go)
    }
    expect(goes).toEqual([null, null, "read:epic-2931"])
    expect(step.cue).toBe(NO_CUE)
  })

  it("starts nothing once called off", () => {
    const counting = stepCue(NO_CUE, { type: "start", item: "read:x" }).cue
    const off = stepCue(counting, { type: "cancel" })
    expect(off).toEqual({ cue: NO_CUE, go: null })
    expect(stepCue(off.cue, { type: "tick" }).go).toBeNull()
  })
})
