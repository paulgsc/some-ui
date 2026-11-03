/**
 * GES5's proof: the pager's `step` over its whole family. Every combination
 * of the deck's orientation, the way the finger goes, when something is under
 * way, whether there is a card that way, where the card's scroller stands,
 * and whether the finger came down on a surface that claims the pointer, is
 * driven as a touch and checked against one rule: the card turns exactly
 * when nothing holds it, there is a card that way, the card can't scroll
 * that way, the surface is the pager's, and the finger went `SWIPE_PX`.
 */
import { describe, expect, it } from "vitest"

import type {
  Deck,
  Edge,
  Orientation,
  PagerEffect,
  PagerEvent,
  PagerState,
  Point,
  Turn,
} from "."
import {
  EDGE_RESISTANCE,
  INITIAL_PAGER,
  lockOf,
  NO_OVERFLOW,
  offsetOf,
  SLOP_PX,
  step,
  SWIPE_PX,
} from "."

const ORIENTATIONS: ReadonlyArray<Orientation> = ["horizontal", "vertical"]
const TURNS: ReadonlyArray<Turn> = ["next", "prev"]
/** When something is under way: never, from the start, mid-drag, at release. */
const HOLDS = ["never", "down", "move", "up"] as const
type Hold = (typeof HOLDS)[number]
const EDGES: ReadonlyArray<Edge> = [
  NO_OVERFLOW,
  { start: true, end: false },
  { start: false, end: true },
  { start: false, end: false },
]

const FROM: Point = { x: 200, y: 300 }

/** A point `travel` along the deck from `FROM`, and `across` across it. */
function at(orientation: Orientation, travel: number, across = 0): Point {
  return orientation === "horizontal"
    ? { x: FROM.x + travel, y: FROM.y + across }
    : { x: FROM.x + across, y: FROM.y + travel }
}

/** The finger's travel along the deck that turns toward `to`. */
const toward = (to: Turn, px: number): number => (to === "next" ? -px : px)

type Run = {
  readonly state: PagerState
  readonly effects: ReadonlyArray<PagerEffect>
}

/** Runs `events`, each against the deck as it stands then. */
function run(
  events: ReadonlyArray<readonly [PagerEvent, Deck]>,
  from: PagerState = INITIAL_PAGER
): Run {
  let state = from
  const effects: Array<PagerEffect> = []
  for (const [event, deck] of events) {
    const [next, out] = step(state, event, deck)
    state = next
    effects.push(...out)
  }
  return { state, effects }
}

type Case = {
  readonly orientation: Orientation
  readonly to: Turn
  readonly hold: Hold
  readonly can: boolean
  readonly edge: Edge
  readonly claimed: boolean
  readonly px: number
}

/** One touch for `c`: down, two moves, up. */
function swipe(c: Case): Run {
  const deck = (held: boolean): Deck => ({
    orientation: c.orientation,
    canPrev: c.to === "prev" ? c.can : true,
    canNext: c.to === "next" ? c.can : true,
    held,
  })
  const travel = toward(c.to, c.px)
  return run([
    [
      {
        type: "down",
        touch: { at: FROM, fingers: 1, claimed: c.claimed, edge: c.edge },
      },
      deck(c.hold === "down"),
    ],
    [
      { type: "move", at: at(c.orientation, travel / 2) },
      deck(c.hold === "down"),
    ],
    [
      { type: "move", at: at(c.orientation, travel) },
      deck(c.hold === "down" || c.hold === "move"),
    ],
    [{ type: "up" }, deck(c.hold !== "never")],
  ])
}

function* family(): Generator<Case> {
  for (const orientation of ORIENTATIONS)
    for (const to of TURNS)
      for (const hold of HOLDS)
        for (const can of [true, false])
          for (const edge of EDGES)
            for (const claimed of [false, true])
              for (const px of [SWIPE_PX - 1, SWIPE_PX, 140])
                yield { orientation, to, hold, can, edge, claimed, px }
}

/** The rule the family is checked against. */
function turns(c: Case): boolean {
  const edgeOpen = c.to === "next" ? c.edge.end : c.edge.start
  return (
    c.hold === "never" && c.can && edgeOpen && !c.claimed && c.px >= SWIPE_PX
  )
}

describe("the pager's step over its family (GES5)", () => {
  it("turns the card exactly when the rule says, and only that way", () => {
    let cases = 0
    let turned = 0
    for (const c of family()) {
      cases += 1
      const { state, effects } = swipe(c)
      const expected = turns(c)
      if (expected) turned += 1
      expect({ c, effects }).toEqual({
        c,
        effects: expected ? [{ kind: "page", to: c.to }] : [],
      })
      expect(state.kind).toBe(expected ? "paged" : "idle")
    }
    // The family is whole: 2 × 2 × 4 × 2 × 4 × 2 × 3, of which each
    // orientation and direction turns at two distances over two edges.
    expect(cases).toBe(768)
    expect(turned).toBe(2 * 2 * 2 * 2)
  })

  it("lets a touch go across the deck for the card or the page to scroll", () => {
    for (const orientation of ORIENTATIONS) {
      const deck: Deck = {
        orientation,
        canPrev: true,
        canNext: true,
        held: false,
      }
      // Mostly across, then far along: still the scroll's.
      const { state, effects } = run([
        [
          {
            type: "down",
            touch: { at: FROM, fingers: 1, claimed: false, edge: NO_OVERFLOW },
          },
          deck,
        ],
        [{ type: "move", at: at(orientation, 4, 30) }, deck],
        [{ type: "move", at: at(orientation, -200, 30) }, deck],
        [{ type: "up" }, deck],
      ])
      expect(effects).toEqual([])
      expect(state).toEqual(INITIAL_PAGER)
    }
  })

  it("passes a second finger, and a touch cancelled, without turning", () => {
    const deck: Deck = {
      orientation: "horizontal",
      canPrev: true,
      canNext: true,
      held: false,
    }
    const touch = {
      at: FROM,
      fingers: 1,
      claimed: false,
      edge: NO_OVERFLOW,
    }
    const pinch = run([
      [{ type: "down", touch }, deck],
      [{ type: "move", at: at("horizontal", -100) }, deck],
      [{ type: "down", touch: { ...touch, fingers: 2 } }, deck],
      [{ type: "move", at: at("horizontal", -140) }, deck],
      [{ type: "up" }, deck],
    ])
    expect(pinch.effects).toEqual([])
    const cancelled = run([
      [{ type: "down", touch }, deck],
      [{ type: "move", at: at("horizontal", -100) }, deck],
      [{ type: "cancel" }, deck],
      [{ type: "up" }, deck],
    ])
    expect(cancelled.effects).toEqual([])
    expect(cancelled.state).toEqual(INITIAL_PAGER)
  })

  it("swallows the click a swipe ends in, and only that one", () => {
    const deck: Deck = {
      orientation: "horizontal",
      canPrev: true,
      canNext: true,
      held: false,
    }
    const touch = {
      at: FROM,
      fingers: 1,
      claimed: false,
      edge: NO_OVERFLOW,
    }
    const swiped = run([
      [{ type: "down", touch }, deck],
      [{ type: "move", at: at("horizontal", -100) }, deck],
      [{ type: "up" }, deck],
      [{ type: "click" }, deck],
      [{ type: "click" }, deck],
    ])
    expect(swiped.effects).toEqual([
      { kind: "page", to: "next" },
      { kind: "swallow" },
    ])
    // A swipe that ended off any button holds back nothing: the next touch
    // clears it.
    const next = run(
      [
        [{ type: "down", touch }, deck],
        [{ type: "up" }, deck],
        [{ type: "click" }, deck],
      ],
      { kind: "paged" }
    )
    expect(next.effects).toEqual([])
    // A tap is a tap.
    const tap = run([
      [{ type: "down", touch }, deck],
      [{ type: "up" }, deck],
      [{ type: "click" }, deck],
    ])
    expect(tap.effects).toEqual([])
  })
})

describe("the card's travel", () => {
  const dragging = (travel: number): PagerState => ({
    kind: "dragging",
    from: FROM,
    edge: NO_OVERFLOW,
    travel,
  })
  it("follows the finger toward a card, and resists toward none", () => {
    const open: Deck = {
      orientation: "horizontal",
      canPrev: false,
      canNext: true,
      held: false,
    }
    expect(offsetOf(dragging(-40), open)).toBe(-40)
    expect(offsetOf(dragging(40), open)).toBe(40 * EDGE_RESISTANCE)
    expect(offsetOf(dragging(-40), { ...open, held: true })).toBe(
      -40 * EDGE_RESISTANCE
    )
    expect(offsetOf(INITIAL_PAGER, open)).toBe(0)
  })
})

describe("the one direction lock", () => {
  it("is unknown within the slop, and the larger travel past it", () => {
    expect(lockOf(FROM, { x: FROM.x + SLOP_PX, y: FROM.y - SLOP_PX })).toBe(
      null
    )
    expect(lockOf(FROM, { x: FROM.x - 11, y: FROM.y + 3 })).toBe("x")
    expect(lockOf(FROM, { x: FROM.x + 3, y: FROM.y - 11 })).toBe("y")
    // A tie past the slop is across a page's scroll: sideways.
    expect(lockOf(FROM, { x: FROM.x + 11, y: FROM.y + 11 })).toBe("x")
  })
})
