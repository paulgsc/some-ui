/**
 * The tracker's family (RR26): every state against every event, with the
 * rules that must hold on each step, then the owner's paths through it.
 */
import { describe, expect, it } from "vitest"

import type {
  OpenSpan,
  TrackerEffect,
  TrackerEvent,
  TrackerState,
} from "./index"
import { CAP_MS, spanSeconds, stepTracker } from "./index"

const T0 = Date.parse("2026-11-19T09:40:00Z")
const MIN = 60_000

const where: OpenSpan["where"] = {
  week: "2026-w47",
  ticket: "TB-101",
  step: "academy",
  exercise: 1,
  points: [1, 2],
}
const span: OpenSpan = { id: "s1", where, startedAt: T0, device: "phone" }
const other: OpenSpan = {
  id: "s2",
  where: { ...where, step: "read", exercise: null, points: [1, 2, 3] },
  startedAt: T0 + 5 * MIN,
  device: "tablet",
}

const before = T0 + 42 * MIN
const after = T0 + CAP_MS + 30 * MIN

const STATES: ReadonlyArray<[string, TrackerState]> = [
  ["unknown", { kind: "unknown" }],
  ["idle", { kind: "idle" }],
  ["running", { kind: "running", span }],
  [
    "asking (you)",
    {
      kind: "asking",
      span,
      stoppedAt: before,
      stoppedBy: "you",
      notKept: false,
    },
  ],
  [
    "asking (itself)",
    {
      kind: "asking",
      span,
      stoppedAt: T0 + CAP_MS,
      stoppedBy: "itself",
      notKept: false,
    },
  ],
  [
    "keeping",
    {
      kind: "keeping",
      closed: {
        span,
        stoppedAt: before,
        stoppedBy: "you",
        answer: "all",
        countedSeconds: 42 * 60,
      },
    },
  ],
]

const EVENTS: ReadonlyArray<[string, TrackerEvent]> = [
  ["home: nothing open", { type: "homeSays", open: null, at: before }],
  ["home: this span, early", { type: "homeSays", open: span, at: before }],
  ["home: this span, late", { type: "homeSays", open: span, at: after }],
  ["home: another span", { type: "homeSays", open: other, at: before }],
  ["start", { type: "start", span: other }],
  ["back, early", { type: "back", at: before }],
  ["back, late", { type: "back", at: after }],
  ["seen, early", { type: "seen", at: before }],
  ["seen, late", { type: "seen", at: after }],
  ["answer all", { type: "answer", answer: { kind: "all" } }],
  ["answer none", { type: "answer", answer: { kind: "none" } }],
  ["answer part 30", { type: "answer", answer: { kind: "part", minutes: 30 } }],
  [
    "answer part, more than the span",
    { type: "answer", answer: { kind: "part", minutes: 10_000 } },
  ],
  [
    "answer part, without end",
    {
      type: "answer",
      answer: { kind: "part", minutes: Number.POSITIVE_INFINITY },
    },
  ],
  [
    "answer part, not a number",
    { type: "answer", answer: { kind: "part", minutes: Number.NaN } },
  ],
  [
    "answer part, below zero",
    { type: "answer", answer: { kind: "part", minutes: -5 } },
  ],
  ["kept", { type: "kept", kept: true }],
  ["not kept", { type: "kept", kept: false }],
]

/** The span a state holds open, if any. */
const openIn = (state: TrackerState): OpenSpan | null =>
  state.kind === "running" || state.kind === "asking"
    ? state.span
    : state.kind === "keeping"
      ? state.closed.span
      : null

describe("the tracker, every state against every event", () => {
  for (const [stateName, state] of STATES) {
    for (const [eventName, event] of EVENTS) {
      it(`${stateName} + ${eventName}`, () => {
        const next = stepTracker(state, event)
        const effects: ReadonlyArray<TrackerEffect> = next.effects

        const starts = effects.filter((each) => each.type === "start")
        expect(starts.length).toBe(
          state.kind === "idle" && event.type === "start" ? 1 : 0
        )

        if (next.state.kind === "asking") {
          const cap = next.state.span.startedAt + CAP_MS
          expect(next.state.stoppedAt).toBeLessThanOrEqual(cap)
          expect(next.state.stoppedBy === "itself").toBe(
            next.state.stoppedAt === cap
          )
        }

        for (const effect of effects) {
          if (effect.type === "start") continue
          const { closed } = effect
          const spanned = spanSeconds(closed.span, closed.stoppedAt)
          expect(Number.isInteger(closed.countedSeconds)).toBe(true)
          expect(closed.countedSeconds).toBeGreaterThanOrEqual(0)
          expect(closed.countedSeconds).toBeLessThanOrEqual(spanned)
          if (closed.answer === "all") {
            expect(closed.countedSeconds).toBe(spanned)
          }
          if (closed.answer === "none") expect(closed.countedSeconds).toBe(0)
        }

        const closes = effects.filter((each) => each.type === "close")
        expect(closes.length).toBe(
          state.kind === "asking" && event.type === "answer" ? 1 : 0
        )

        // Home alone knows what is open: what it says is held, unless an
        // answer is on its way to it.
        if (event.type === "homeSays" && state.kind !== "keeping") {
          expect(openIn(next.state)?.id).toBe(event.open?.id)
        }

        // A span in hand is never dropped unanswered or swapped for
        // another, except as home says or once it is kept.
        const held = openIn(state)
        if (
          held !== null &&
          openIn(next.state)?.id !== held.id &&
          event.type !== "homeSays"
        ) {
          expect(state.kind).toBe("keeping")
          expect(event).toEqual({ type: "kept", kept: true })
        }
      })
    }
  }
})

describe("the owner's paths", () => {
  const run = (
    events: ReadonlyArray<TrackerEvent>,
    from: TrackerState = { kind: "idle" }
  ): { state: TrackerState; effects: Array<TrackerEffect> } => {
    let state = from
    const effects: Array<TrackerEffect> = []
    for (const event of events) {
      const next = stepTracker(state, event)
      state = next.state
      effects.push(...next.effects)
    }
    return { state, effects }
  }

  it("start, come back, part of it, kept: counts the part and says so", () => {
    const { state, effects } = run([
      { type: "start", span },
      { type: "back", at: T0 + 110 * MIN },
      { type: "answer", answer: { kind: "part", minutes: 90 } },
      { type: "kept", kept: true },
    ])
    expect(state).toEqual({ kind: "idle" })
    expect(effects.map((each) => each.type)).toEqual([
      "start",
      "close",
      "counted",
    ])
    const counted = effects.at(-1)
    expect(counted?.type === "counted" && counted.closed.countedSeconds).toBe(
      90 * 60
    )
  })

  it("left running past the cap: stops itself at the cap, asks on return", () => {
    const { state } = run([
      { type: "start", span },
      { type: "seen", at: after },
    ])
    expect(state).toEqual({
      kind: "asking",
      span,
      stoppedAt: T0 + CAP_MS,
      stoppedBy: "itself",
      notKept: false,
    })
  })

  it("a reload mid-span takes it up from home, still running", () => {
    const { state } = run([{ type: "homeSays", open: span, at: before }], {
      kind: "unknown",
    })
    expect(state).toEqual({ kind: "running", span })
  })

  it("a second device takes up the open span instead of starting another", () => {
    const { state, effects } = run([
      { type: "homeSays", open: other, at: before },
      { type: "start", span },
    ])
    expect(state).toEqual({ kind: "running", span: other })
    expect(effects).toEqual([])
  })

  it("an answer home couldn't keep asks again and says so", () => {
    const { state } = run([
      { type: "start", span },
      { type: "back", at: before },
      { type: "answer", answer: { kind: "all" } },
      { type: "kept", kept: false },
    ])
    expect(state.kind === "asking" && state.notKept).toBe(true)
  })

  it("answered on another device: home says nothing is open, the question goes", () => {
    const { state } = run([
      { type: "start", span },
      { type: "back", at: before },
      { type: "homeSays", open: null, at: before + MIN },
    ])
    expect(state).toEqual({ kind: "idle" })
  })
})
