import { BADGE_TIMING, revealEnds, withBadgesSeen } from "@video-render/badges"
import { parseCutList } from "@video-render/cut-list"
import type { BurnIn, CutList, Shot } from "@video-render/cut-list"
import { cutList, shot } from "@video-render/testing"
import { describe, expect, it } from "vitest"

const badge = (state: string): BurnIn => ({
  kind: "status-badge",
  params: { badge: state },
})
const lines = (...states: ReadonlyArray<string>): BurnIn => ({
  kind: "terminal",
  params: { lines: states.map((badge) => ({ text: "x", badge })) },
})

/** A scene long enough for every badge here to spell itself out. */
const long = (id: string, burnIns: ReadonlyArray<BurnIn>): Shot =>
  shot(id, { durationMs: 6000, burnIns: [...burnIns] })

const parsed = (raw: unknown): CutList => {
  const p = parseCutList(raw)
  if (!p.ok) throw new Error(p.problems.join("; "))
  return p.value
}

describe("the badges a video showed before each scene", () => {
  it("are the states of every earlier scene's badges, in the order they first appeared", () => {
    const cut = parsed(
      cutList(
        [
          long("S1", [badge("pr")]),
          long("S2", [{ kind: "headline", params: {} }]),
          long("S3", [lines("main", "you", "pr")]),
          long("S4", [badge("gap")]),
          long("S5", [badge("main")]),
        ],
        // A terminal card is stamped (`stamp.ts`).
        { stamp: { sources: ["paulgsc/some-ui@5f3dd29"], date: "2026-11-14" } }
      )
    )
    expect(
      withBadgesSeen(
        cut.shots,
        cut.shots.map((s) => s.durationMs)
      ).map((bs) => bs.map((b) => b.params["badgesSeen"] ?? null))
    ).toEqual([
      [[]],
      [null],
      [["pr"]],
      [["pr", "main", "you"]],
      [["pr", "main", "you", "gap"]],
    ])
  })

  it("leave out a state whose scene showed too short for its badge to finish spelling itself out", () => {
    const cut = parsed(
      cutList([
        long("S1", [badge("gap")]),
        long("S2", [badge("gap")]),
        long("S3", [badge("gap")]),
      ])
    )
    // A status badge spells itself out 3.3 s in; the next scene comes in over S1 at 2.8 s.
    expect(
      withBadgesSeen(cut.shots, [2800, 3300, 3300]).map(
        (bs) => bs[0]?.params["badgesSeen"]
      )
    ).toEqual([[], [], ["gap"]])
  })

  it("count a card item's badge from the item's own time, for every interleaving with the scene's length", () => {
    const { leadMs, gapMs, revealMs } = BADGE_TIMING
    // Three items, each either at its default time or given one; the scene
    // ends a little before, at, or after each item's reveal ends.
    const givens: ReadonlyArray<number | undefined> = [undefined, 0, 4000]
    for (const a of givens)
      for (const b of givens)
        for (const c of givens) {
          const items = [
            { badge: "pr", atMs: a },
            { badge: "you", atMs: b },
            { badge: "pr", atMs: c },
          ].map(({ badge, atMs }) =>
            atMs === undefined
              ? { text: "x", badge }
              : { text: "x", badge, atMs }
          )
          const times: Array<number> = []
          for (const item of [a, b, c])
            times.push(
              item ??
                (times.length === 0 ? leadMs : (times.at(-1) ?? 0) + gapMs)
            )
          const ends = new Map<string, number>()
          for (const [k, state] of ["pr", "you", "pr"].entries()) {
            const end = (times[k] ?? 0) + revealMs
            ends.set(state, Math.min(end, ends.get(state) ?? end))
          }
          const card: BurnIn = { kind: "terminal", params: { lines: items } }
          expect(revealEnds(card.params)).toEqual(ends)
          for (const end of new Set(ends.values()))
            for (const shownMs of [end - 1, end, end + 1]) {
              const seen = withBadgesSeen(
                [
                  shot("S1", { burnIns: [card] }),
                  shot("S2", { burnIns: [badge("gap")] }),
                ],
                [shownMs, 3300]
              )[1]?.[0]?.params["badgesSeen"]
              // In the order their reveals finished.
              expect(seen).toEqual(
                [...ends]
                  .filter(([, e]) => e <= shownMs)
                  .sort(([, x], [, y]) => x - y)
                  .map(([s]) => s)
              )
            }
        }
  })

  it("leave out a card's later badge whose reveal the scene cuts off (#2982)", () => {
    // The fourth line appears at 4.15 s, after a 4 s scene has ended.
    const card = lines("main", "you", "main", "pr")
    const [, next] = withBadgesSeen(
      [shot("S1", { burnIns: [card] }), shot("S2", { burnIns: [badge("pr")] })],
      [4000, 3300]
    )
    expect(next?.[0]?.params["badgesSeen"]).toEqual(["main"])
  })

  it("are never written by hand, and never over the whole video", () => {
    const p = parseCutList({
      ...cutList([
        long("S1", [
          { kind: "status-badge", params: { badge: "pr", badgesSeen: [] } },
        ]),
      ]),
      burnIns: [badge("main")],
    })
    expect(p.ok ? [] : p.problems).toEqual([
      "S1: the badges shown earlier are worked out from the scenes; nothing is written for them",
      "a status badge belongs to a scene, never to the whole video",
    ])
  })
})
