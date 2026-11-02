/**
 * The drag-down's whole policy (PULL0): every event in every state, as one
 * table. A row the table leaves out fails, so a new phase or event cannot
 * land without saying what it does in each of the others.
 */
import { describe, expect, it } from "vitest"

import type {
  Phase,
  PullEffect,
  PullEvent,
  PullState,
} from "@/lib/pull-refresh/model"
import {
  ARM_PX,
  DONE_MS,
  FAILED_MS,
  INITIAL_PULL,
  MAX_PX,
  RESISTANCE,
  SLOP_PX,
  step,
  travel,
} from "@/lib/pull-refresh/model"

const FROM = { x: 100, y: 50 }
const AT = 1_762_000_000_000

const PHASES = {
  idle: { kind: "idle" },
  tracking: { kind: "tracking", from: FROM },
  pulling: { kind: "pulling", from: FROM, distance: 20 },
  armed: { kind: "armed", from: FROM, distance: 70 },
  checking: { kind: "checking", pull: 1 },
  done: { kind: "done", pull: 1, at: AT },
  failed: { kind: "failed", pull: 1, at: AT },
} as const satisfies Record<Phase["kind"], Phase>

const below = (dy: number, dx = 0): PullEvent => ({
  type: "touchMove",
  at: { x: FROM.x + dx, y: FROM.y + dy },
})

const EVENTS = {
  startTop: { type: "touchStart", at: FROM, atTop: true, fingers: 1 },
  startBelow: { type: "touchStart", at: FROM, atTop: false, fingers: 1 },
  startTwo: { type: "touchStart", at: FROM, atTop: true, fingers: 2 },
  // Far enough that the indicator passes ARM_PX.
  moveFar: below(ARM_PX / RESISTANCE + 20),
  // Past the slop, short of ARM_PX.
  moveShort: below(30),
  moveUp: below(-30),
  // Sideways past the slop before going down.
  moveSide: below(5, 40),
  // Inside the slop either way.
  moveSmall: below(5, 3),
  end: { type: "touchEnd" },
  cancel: { type: "touchCancel" },
  settledMine: { type: "settled", pull: 1, outcome: "done", at: AT },
  settledFailed: { type: "settled", pull: 1, outcome: "failed", at: AT },
  settledStale: { type: "settled", pull: 0, outcome: "done", at: AT },
  fadedMine: { type: "faded", pull: 1 },
  fadedStale: { type: "faded", pull: 0 },
  left: { type: "left" },
} as const satisfies Record<string, PullEvent>

type PhaseName = keyof typeof PHASES
type EventName = keyof typeof EVENTS

/** Every event in every state: the phase it leads to. */
const TABLE: Record<PhaseName, Record<EventName, Phase["kind"]>> = {
  idle: {
    startTop: "tracking",
    startBelow: "idle",
    startTwo: "idle",
    moveFar: "idle",
    moveShort: "idle",
    moveUp: "idle",
    moveSide: "idle",
    moveSmall: "idle",
    end: "idle",
    cancel: "idle",
    settledMine: "idle",
    settledFailed: "idle",
    settledStale: "idle",
    fadedMine: "idle",
    fadedStale: "idle",
    left: "idle",
  },
  tracking: {
    startTop: "tracking",
    startBelow: "idle",
    startTwo: "idle",
    moveFar: "armed",
    moveShort: "pulling",
    moveUp: "idle",
    moveSide: "idle",
    moveSmall: "tracking",
    end: "idle",
    cancel: "idle",
    settledMine: "tracking",
    settledFailed: "tracking",
    settledStale: "tracking",
    fadedMine: "tracking",
    fadedStale: "tracking",
    left: "idle",
  },
  pulling: {
    startTop: "tracking",
    startBelow: "idle",
    startTwo: "idle",
    moveFar: "armed",
    moveShort: "pulling",
    moveUp: "idle",
    // Once going down, a drift sideways is still the pull.
    moveSide: "pulling",
    moveSmall: "pulling",
    end: "idle",
    cancel: "idle",
    settledMine: "pulling",
    settledFailed: "pulling",
    settledStale: "pulling",
    fadedMine: "pulling",
    fadedStale: "pulling",
    left: "idle",
  },
  armed: {
    startTop: "tracking",
    startBelow: "idle",
    startTwo: "idle",
    moveFar: "armed",
    // Back above ARM_PX: letting go now does nothing.
    moveShort: "pulling",
    moveUp: "idle",
    moveSide: "pulling",
    moveSmall: "pulling",
    end: "checking",
    cancel: "idle",
    settledMine: "armed",
    settledFailed: "armed",
    settledStale: "armed",
    fadedMine: "armed",
    fadedStale: "armed",
    left: "idle",
  },
  checking: {
    startTop: "checking",
    startBelow: "checking",
    startTwo: "checking",
    moveFar: "checking",
    moveShort: "checking",
    moveUp: "checking",
    moveSide: "checking",
    moveSmall: "checking",
    end: "checking",
    cancel: "checking",
    settledMine: "done",
    settledFailed: "failed",
    settledStale: "checking",
    fadedMine: "checking",
    fadedStale: "checking",
    left: "idle",
  },
  done: {
    startTop: "tracking",
    startBelow: "done",
    startTwo: "done",
    moveFar: "done",
    moveShort: "done",
    moveUp: "done",
    moveSide: "done",
    moveSmall: "done",
    end: "done",
    cancel: "done",
    settledMine: "done",
    settledFailed: "done",
    settledStale: "done",
    fadedMine: "idle",
    fadedStale: "done",
    left: "idle",
  },
  failed: {
    startTop: "tracking",
    startBelow: "failed",
    startTwo: "failed",
    moveFar: "failed",
    moveShort: "failed",
    moveUp: "failed",
    moveSide: "failed",
    moveSmall: "failed",
    end: "failed",
    cancel: "failed",
    settledMine: "failed",
    settledFailed: "failed",
    settledStale: "failed",
    fadedMine: "idle",
    fadedStale: "failed",
    left: "idle",
  },
}

/** The only steps that run anything; every other step runs nothing. */
const EFFECTS: Partial<
  Record<`${PhaseName} ${EventName}`, ReadonlyArray<PullEffect>>
> = {
  "armed end": [{ kind: "check", pull: 2 }],
  "checking settledMine": [{ kind: "fade", pull: 1, afterMs: DONE_MS }],
  "checking settledFailed": [{ kind: "fade", pull: 1, afterMs: FAILED_MS }],
}

const stateOf = (name: PhaseName): PullState => ({
  pulls: 1,
  phase: PHASES[name],
})

const isPhase = (key: string): key is PhaseName => Object.hasOwn(PHASES, key)
const isEvent = (key: string): key is EventName => Object.hasOwn(EVENTS, key)

describe("step: every event in every state", () => {
  for (const [name, row] of Object.entries(TABLE)) {
    if (!isPhase(name)) throw new Error(`no phase ${name}`)
    for (const [event, expected] of Object.entries(row)) {
      if (!isEvent(event)) throw new Error(`no event ${event}`)
      it(`${name} + ${event} → ${expected}`, () => {
        const state = stateOf(name)
        const [next, effects] = step(state, EVENTS[event])
        expect(next.phase.kind).toBe(expected)
        expect(effects).toEqual(EFFECTS[`${name} ${event}`] ?? [])
        // A step that changes nothing hands back the same state, so the
        // runtime tells no one. Only a finger moving a drag, or coming down
        // again, makes a new one in the same phase.
        const redrawn =
          (name === "tracking" && event === "startTop") ||
          ((name === "pulling" || name === "armed") && event.startsWith("move"))
        if (expected === name && !redrawn) expect(next).toBe(state)
      })
    }
  }
})

describe("step: what each arm carries", () => {
  it("numbers each pull, and the answer for it lands on it", () => {
    const [checking] = step(stateOf("armed"), EVENTS.end)
    expect(checking).toEqual({ pulls: 2, phase: { kind: "checking", pull: 2 } })
    // Pull 1's answer, landing after pull 2 went out, is stale.
    expect(step(checking, EVENTS.settledMine)[0]).toBe(checking)
    const [done] = step(checking, {
      type: "settled",
      pull: 2,
      outcome: "done",
      at: AT,
    })
    expect(done.phase).toEqual({ kind: "done", pull: 2, at: AT })
  })

  it("an answer after the page moved on paints nothing", () => {
    const [checking] = step(stateOf("armed"), EVENTS.end)
    const [left] = step(checking, EVENTS.left)
    const [after] = step(left, {
      type: "settled",
      pull: 2,
      outcome: "done",
      at: AT,
    })
    expect(after.phase.kind).toBe("idle")
    expect(after).toBe(left)
  })

  it("the indicator follows the finger, resisting, up to MAX_PX", () => {
    const [short] = step(stateOf("tracking"), EVENTS.moveShort)
    expect(short.phase).toEqual({
      kind: "pulling",
      from: FROM,
      distance: 30 * RESISTANCE,
    })
    const [far] = step(stateOf("pulling"), below(10_000))
    expect(far.phase).toEqual({ kind: "armed", from: FROM, distance: MAX_PX })
    expect(travel(-5)).toBe(0)
    expect(travel(ARM_PX / RESISTANCE)).toBe(ARM_PX)
  })

  it("a touch inside the slop decides nothing", () => {
    const state = stateOf("tracking")
    expect(step(state, below(SLOP_PX, SLOP_PX))[0]).toBe(state)
  })

  it("starts with nothing pulled", () => {
    expect(INITIAL_PULL).toEqual({ pulls: 0, phase: { kind: "idle" } })
  })
})
