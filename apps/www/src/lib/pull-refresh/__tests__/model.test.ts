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
  CHECK_MS,
  DONE_MS,
  FAILED_MS,
  MAX_PX,
  RESISTANCE,
  SLOP_PX,
  step,
  travel,
} from "@/lib/pull-refresh/model"

const FROM = { x: 100, y: 50 }
const AT = 1_762_000_000_000

/** Each phase, and a check still out after its page moved on. */
const PHASES = {
  idle: { kind: "idle" },
  tracking: { kind: "tracking", from: FROM },
  pulling: { kind: "pulling", from: FROM, distance: 20 },
  armed: { kind: "armed", from: FROM, distance: 70 },
  checking: { kind: "checking", pull: 1, shown: true },
  unseen: { kind: "checking", pull: 1, shown: false },
  done: { kind: "done", pull: 1, at: AT },
  failed: { kind: "failed", pull: 1, at: AT, offline: false },
} as const satisfies Record<string, Phase>

type PhaseName = keyof typeof PHASES

/** A phase by its row's name: a check that is out but unseen is `unseen`. */
const nameOf = (phase: Phase): PhaseName =>
  phase.kind === "checking" && !phase.shown ? "unseen" : phase.kind

const below = (dy: number, dx = 0): PullEvent => ({
  type: "touchMove",
  at: { x: FROM.x + dx, y: FROM.y + dy },
})

const settled = (
  pull: number,
  end: "read" | "offline" | "unread"
): PullEvent => ({
  type: "settled",
  pull,
  end,
  at: AT,
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
  read: settled(1, "read"),
  // Also what the deadline answers.
  unread: settled(1, "unread"),
  offline: settled(1, "offline"),
  readStale: settled(0, "read"),
  fadedMine: { type: "faded", pull: 1 },
  fadedStale: { type: "faded", pull: 0 },
  left: { type: "left" },
} as const satisfies Record<string, PullEvent>

type EventName = keyof typeof EVENTS

/** A row where nothing in hand or out changes anything. */
const still = (name: PhaseName): Record<EventName, PhaseName> => ({
  startTop: name,
  startBelow: name,
  startTwo: name,
  moveFar: name,
  moveShort: name,
  moveUp: name,
  moveSide: name,
  moveSmall: name,
  end: name,
  cancel: name,
  read: name,
  unread: name,
  offline: name,
  readStale: name,
  fadedMine: name,
  fadedStale: name,
  left: name,
})

/** Every event in every state: the phase it leads to. */
const TABLE: Record<PhaseName, Record<EventName, PhaseName>> = {
  idle: { ...still("idle"), startTop: "tracking" },
  tracking: {
    ...still("tracking"),
    startBelow: "idle",
    startTwo: "idle",
    moveFar: "armed",
    moveShort: "pulling",
    moveUp: "idle",
    moveSide: "idle",
    end: "idle",
    cancel: "idle",
    left: "idle",
  },
  // Once going down, a drift sideways is still the pull.
  pulling: {
    ...still("pulling"),
    startTop: "tracking",
    startBelow: "idle",
    startTwo: "idle",
    moveFar: "armed",
    moveUp: "idle",
    end: "idle",
    cancel: "idle",
    left: "idle",
  },
  armed: {
    ...still("armed"),
    startTop: "tracking",
    startBelow: "idle",
    startTwo: "idle",
    // Back above ARM_PX: letting go now does nothing.
    moveShort: "pulling",
    moveUp: "idle",
    moveSide: "pulling",
    moveSmall: "pulling",
    end: "checking",
    cancel: "idle",
    left: "idle",
  },
  // One check at a time: nothing in hand moves it.
  checking: {
    ...still("checking"),
    read: "done",
    unread: "failed",
    offline: "failed",
    left: "unseen",
  },
  // Still out after its page moved on: still one at a time, and its answer
  // paints nothing.
  unseen: {
    ...still("unseen"),
    read: "idle",
    unread: "idle",
    offline: "idle",
  },
  done: {
    ...still("done"),
    startTop: "tracking",
    fadedMine: "idle",
    left: "idle",
  },
  failed: {
    ...still("failed"),
    startTop: "tracking",
    fadedMine: "idle",
    left: "idle",
  },
}

/** The only steps that run anything; every other step runs nothing. */
const EFFECTS: Partial<
  Record<`${PhaseName} ${EventName}`, ReadonlyArray<PullEffect>>
> = {
  "armed end": [
    { kind: "check", pull: 2 },
    { kind: "deadline", pull: 2, afterMs: CHECK_MS },
  ],
  "checking read": [{ kind: "fade", pull: 1, afterMs: DONE_MS }],
  "checking unread": [{ kind: "fade", pull: 1, afterMs: FAILED_MS }],
  "checking offline": [{ kind: "fade", pull: 1, afterMs: FAILED_MS }],
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
        expect(nameOf(next.phase)).toBe(expected)
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
  it("numbers each pull, and only the first answer for it counts", () => {
    const [checking] = step(stateOf("armed"), EVENTS.end)
    expect(checking).toEqual({
      pulls: 2,
      phase: { kind: "checking", pull: 2, shown: true },
    })
    // Pull 1's answer, landing after pull 2 went out, is stale.
    expect(step(checking, EVENTS.read)[0]).toBe(checking)
    const [done] = step(checking, settled(2, "read"))
    expect(done.phase).toEqual({ kind: "done", pull: 2, at: AT })
    // The deadline, after the reads answered, finds nothing out.
    expect(step(done, settled(2, "unread"))[0]).toBe(done)
  })

  it("says when there was no connection to read with", () => {
    const [offline] = step(stateOf("checking"), EVENTS.offline)
    expect(offline.phase).toEqual({
      kind: "failed",
      pull: 1,
      at: AT,
      offline: true,
    })
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
})
