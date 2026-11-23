/**
 * The phone's deck (C1422): one scene index, round and round, a turn that
 * lands exactly once, and a swap with no motion.
 */
import type { DeckEvent, DeckState } from "@/landing/deck"
import { restAt, SETTLE_MS, step, viewOf } from "@/landing/deck"
import { describe, expect, it } from "vitest"

const N = 5

/** Runs `events` from `from`, returning the last state and every scene landed on. */
function run(
  events: ReadonlyArray<DeckEvent>,
  from: DeckState = restAt(0),
  motion = true
): { state: DeckState; landed: Array<number> } {
  let state = from
  const landed: Array<number> = []
  for (const event of events) {
    const [next, effects] = step(state, event, N, motion)
    state = next
    for (const e of effects) landed.push(e.at)
  }
  return { state, landed }
}

describe("the deck", () => {
  it("turns past the last scene to the first, and back from the first to the last", () => {
    const next = run(
      [
        { type: "turn", to: "next", now: 0 },
        { type: "frame", now: SETTLE_MS },
      ],
      restAt(N - 1)
    )
    expect(next.state).toEqual(restAt(0))
    expect(next.landed).toEqual([0])
    const prev = run([
      { type: "turn", to: "prev", now: 0 },
      { type: "frame", now: SETTLE_MS },
    ])
    expect(prev.state).toEqual(restAt(N - 1))
    expect(prev.landed).toEqual([N - 1])
  })

  it("follows the finger, drawing the scene on its side coming in", () => {
    const { state } = run([{ type: "drag", progress: -0.3 }])
    expect(viewOf(state, N, 0)).toEqual({
      at: 0,
      incoming: 1,
      side: -1,
      progress: -0.3,
    })
    const back = run([{ type: "drag", progress: 0.4 }]).state
    expect(viewOf(back, N, 0)).toMatchObject({ incoming: N - 1, side: 1 })
    // A drag past a whole turn is held at one.
    expect(run([{ type: "drag", progress: -3 }]).state).toMatchObject({
      progress: -1,
    })
  })

  it("lets go from where the finger was, easing into the face", () => {
    const { state } = run([
      { type: "drag", progress: -0.5 },
      { type: "turn", to: "next", now: 100 },
    ])
    expect(viewOf(state, N, 100).progress).toBeCloseTo(-0.5)
    const half = viewOf(state, N, 100 + SETTLE_MS / 2).progress
    expect(half).toBeLessThan(-0.5)
    expect(half).toBeGreaterThan(-1)
    expect(viewOf(state, N, 100 + SETTLE_MS).progress).toBeCloseTo(-1)
    // Still turning in until it lands.
    expect(viewOf(state, N, 100 + SETTLE_MS / 2).incoming).toBe(1)
  })

  it("settles a short drag or a cancelled one back, landing nowhere", () => {
    const { state, landed } = run([
      { type: "drag", progress: -0.1 },
      { type: "release", now: 0 },
    ])
    expect(state.kind).toBe("settle")
    expect(viewOf(state, N, SETTLE_MS / 2).incoming).toBe(1)
    const after = run([{ type: "frame", now: SETTLE_MS }], state)
    expect(after.state).toEqual(restAt(0))
    expect([...landed, ...after.landed]).toEqual([])
  })

  it("turns two scenes for a fast double flick, landing each once", () => {
    const { state, landed } = run([
      { type: "drag", progress: -0.3 },
      { type: "turn", to: "next", now: 0 },
      // A second touch comes down before the first turn has landed.
      { type: "touch" },
      { type: "drag", progress: -0.2 },
      { type: "turn", to: "next", now: 50 },
      { type: "frame", now: 50 + SETTLE_MS },
      { type: "frame", now: 60 + SETTLE_MS },
    ])
    expect(state).toEqual(restAt(2))
    expect(landed).toEqual([1, 2])
  })

  it("lands a turn under way before a key turns it again", () => {
    const { state, landed } = run([
      { type: "turn", to: "next", now: 0 },
      { type: "turn", to: "next", now: 10 },
      { type: "turn", to: "prev", now: 20 },
      { type: "frame", now: 20 + SETTLE_MS },
    ])
    expect(state).toEqual(restAt(1))
    expect(landed).toEqual([1, 2, 1])
  })

  it("goes straight to a scene a dot names, landing a turn under way first", () => {
    const { state, landed } = run([
      { type: "turn", to: "next", now: 0 },
      { type: "goto", at: 3 },
    ])
    expect(state).toEqual(restAt(3))
    expect(landed).toEqual([1, 3])
    // The scene already on show: nothing to say.
    expect(run([{ type: "goto", at: 0 }]).landed).toEqual([])
  })

  it("stays still with nothing touching it", () => {
    const { state, landed } = run([
      { type: "frame", now: 1000 },
      { type: "release", now: 2000 },
      { type: "touch" },
    ])
    expect(state).toEqual(restAt(0))
    expect(landed).toEqual([])
  })

  it("swaps at once for a reader who prefers less motion, and draws no drag", () => {
    const dragged = run([{ type: "drag", progress: -0.5 }], restAt(0), false)
    expect(dragged.state).toEqual(restAt(0))
    const turned = run([{ type: "turn", to: "next", now: 0 }], restAt(0), false)
    expect(turned.state).toEqual(restAt(1))
    expect(turned.landed).toEqual([1])
  })

  it("does nothing with fewer than two scenes", () => {
    const [state, effects] = step(
      restAt(0),
      { type: "turn", to: "next", now: 0 },
      1,
      true
    )
    expect(state).toEqual(restAt(0))
    expect(effects).toEqual([])
  })
})
