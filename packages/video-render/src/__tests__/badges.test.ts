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
      withBadgesSeen(cut.shots).map((bs) =>
        bs.map((b) => b.params["badgesSeen"] ?? null)
      )
    ).toEqual([
      [[]],
      [null],
      [["pr"]],
      [["pr", "main", "you"]],
      [["pr", "main", "you", "gap"]],
    ])
  })

  it("are never written by hand, never over the whole video, and a first appearance has time to spell itself out", () => {
    const p = parseCutList({
      ...cutList([
        long("S1", [
          { kind: "status-badge", params: { badge: "pr", badgesSeen: [] } },
        ]),
        shot("S2", { durationMs: 3299, burnIns: [badge("gap")] }),
        shot("S3", { durationMs: 1000, burnIns: [badge("pr")] }),
      ]),
      burnIns: [badge("main")],
    })
    expect(p.ok ? [] : p.problems).toEqual([
      "S2: its badge spells itself out over 3.3 s, longer than the scene",
      "S1: the badges shown earlier are worked out from the scenes; nothing is written for them",
      "a status badge belongs to a scene, never to the whole video",
    ])
  })
})
