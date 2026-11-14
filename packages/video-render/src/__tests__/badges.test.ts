import { withBadgesSeen } from "@video-render/badges"
import { parseCutList } from "@video-render/cut-list"
import type { CutList } from "@video-render/cut-list"
import { cutList, shot } from "@video-render/testing"
import { describe, expect, it } from "vitest"

const badge = (state: string) => ({
  kind: "status-badge",
  params: { badge: state },
})
const lines = (...states: ReadonlyArray<string>) => ({
  kind: "terminal",
  params: { lines: states.map((badge) => ({ text: "x", badge })) },
})

const parsed = (raw: unknown): CutList => {
  const p = parseCutList(raw)
  if (!p.ok) throw new Error(p.problems.join("; "))
  return p.value
}

describe("the badges a video showed before each scene", () => {
  it("are the states of every earlier scene's badges, in the order they first appeared", () => {
    const cut = parsed(
      cutList([
        shot("S1", { burnIns: [badge("pr")] }),
        shot("S2", { burnIns: [{ kind: "headline", params: {} }] }),
        shot("S3", { burnIns: [lines("main", "you", "pr")] }),
        shot("S4", { burnIns: [badge("gap"), badge("main")] }),
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
      [
        ["pr", "main", "you"],
        ["pr", "main", "you", "gap"],
      ],
    ])
  })

  it("are never written by hand, and never over the whole video", () => {
    const p = parseCutList({
      ...cutList([
        shot("S1", {
          burnIns: [
            { kind: "status-badge", params: { badge: "pr", badgesSeen: [] } },
          ],
        }),
      ]),
      burnIns: [badge("main")],
    })
    expect(p.ok ? [] : p.problems).toEqual([
      "S1: the badges shown earlier are worked out from the scenes; nothing is written for them",
      "a status badge belongs to a scene, never to the whole video",
    ])
  })
})
