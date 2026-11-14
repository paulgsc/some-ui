import { withBadgesSeen } from "@video-render/badges"
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

/** A scene long enough for its badges to spell themselves out. */
const long = (id: string, burnIns: ReadonlyArray<BurnIn>): Shot =>
  shot(id, { durationMs: 3300, burnIns: [...burnIns] })

const parsed = (raw: unknown): CutList => {
  const p = parseCutList(raw)
  if (!p.ok) throw new Error(p.problems.join("; "))
  return p.value
}

describe("the badges a video showed before each scene", () => {
  it("are the states of every earlier scene's badges, in the order they first appeared", () => {
    const cut = parsed(
      cutList([
        long("S1", [badge("pr")]),
        long("S2", [{ kind: "headline", params: {} }]),
        long("S3", [lines("main", "you", "pr")]),
        long("S4", [badge("gap")]),
        long("S5", [badge("main")]),
      ])
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
    // S1 lasts 3.3 s, but the next scene comes in over its last 0.5 s.
    expect(
      withBadgesSeen(cut.shots, [2800, 3300, 3300]).map(
        (bs) => bs[0]?.params["badgesSeen"]
      )
    ).toEqual([[], [], ["gap"]])
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
