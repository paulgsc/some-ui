/**
 * BS1 (#2982): the renderer (`@some-ui/video-render`'s `badges.ts`) counts a
 * state as seen once its first badge has spelled itself out, from timing it
 * keeps its own copy of. These hold that copy to the cards' own frames: for
 * every kind's sample, and a card whose items give their own times, each
 * state's badge is open until the moment `revealEnds` names, and shut from it.
 */
/** @vitest-environment node */
import { REVEAL, STATUS_BADGE_LEAD_MS } from "@burn-ins/lib/badge"
import { DESIGNS, frameAt, KINDS, prepare } from "@burn-ins/lib/burn-in"
import { ITEM } from "@burn-ins/lib/cards"
import { LANDSCAPE, PORTRAIT } from "@burn-ins/lib/geometry"
import { samplesOf } from "@burn-ins/lib/samples"
import { BADGE_TIMING, revealEnds } from "@some-ui/video-render"
import { describe, expect, it } from "vitest"

/** The states of every badge mark open in `value`, depth first. */
function openStates(value: unknown): ReadonlyArray<string> {
  if (Array.isArray(value)) return value.flatMap(openStates)
  if (typeof value !== "object" || value === null) return []
  if ("state" in value && "open" in value && typeof value.state === "string")
    return value.open === null ? [] : [value.state]
  return Object.values(value).flatMap(openStates)
}

const STAMP = { sources: ["paulgsc/dotfiles@91cb11b"], date: "2026-11-13" }

/**
 * A terminal whose lines give their own times, out of the default order,
 * with a state repeated: the later-listed `pr` comes first.
 */
const TIMED = {
  title: "Timed",
  stamp: STAMP,
  lines: [
    { text: "a", badge: "pr", atMs: 2000 },
    { text: "b", badge: "you" },
    { text: "c", badge: "main", atMs: 400 },
    { text: "d", badge: "pr", atMs: 100 },
  ],
}

/**
 * A typed terminal (terminal-v2): each line after a command gives the time
 * its command lets it come, so v2 draws it.
 */
const TYPED = {
  title: "Typed",
  stamp: STAMP,
  lines: [
    { prompt: "$", keyword: "ls", text: " /essays", badge: "you" },
    { text: "2026-w44", badge: "main", atMs: 2500 },
    { prompt: "$", keyword: "cat", text: " lane", badge: "pr", atMs: 3700 },
    { text: "state: waiting", badge: "main", atMs: 5000 },
  ],
}

describe("the renderer's badge timing", () => {
  it("is the cards' own", () => {
    expect(BADGE_TIMING).toEqual({
      leadMs: STATUS_BADGE_LEAD_MS,
      gapMs: ITEM.gapMs,
      revealMs: REVEAL.totalMs,
    })
  })

  it("names when each state's badge shuts, for every design of every kind's sample, a timed card and a typed one", () => {
    const cases = [
      ...KINDS.flatMap((kind) =>
        samplesOf(kind).map((params) => ({ kind, params }))
      ),
      { kind: "terminal" as const, params: TIMED },
      { kind: "terminal" as const, params: TYPED },
    ].flatMap((c) =>
      DESIGNS[c.kind].map((design: string) => ({ ...c, design }))
    )
    let checked = 0
    let drawn = 0
    for (const { kind, params, design } of cases) {
      const ends = revealEnds(params)
      // Some samples are drawn for one frame only (the card's for the short),
      // and a design may refuse another's sample (v2, a line while typing).
      const [p] = [LANDSCAPE, PORTRAIT]
        .map((frame) => prepare({ kind, design, params }, frame))
        .filter((r) => r.ok)
      if (p === undefined) continue
      drawn += 1
      // A kind whose badges the renderer can't see must never open one.
      if (ends.size === 0)
        for (let t = 0; t <= 20_000; t += 50)
          expect(openStates(frameAt(p.value, t)), kind).toEqual([])
      for (const [state, end] of ends) {
        expect(
          openStates(frameAt(p.value, end - 1)),
          `${kind} ${state}`
        ).toContain(state)
        expect(
          openStates(frameAt(p.value, end)),
          `${kind} ${state}`
        ).not.toContain(state)
        checked += 1
      }
    }
    expect(checked).toBeGreaterThanOrEqual(15)
    // Every kind's samples draw under its first design, and the typed card under v2.
    expect(drawn).toBeGreaterThan(KINDS.length)
    expect(
      prepare(
        { kind: "terminal", design: "terminal-v2", params: TYPED },
        LANDSCAPE
      ).ok
    ).toBe(true)
  })
})
