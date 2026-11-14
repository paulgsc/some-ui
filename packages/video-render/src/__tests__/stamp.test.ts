import { parseCutList } from "@video-render/cut-list"
import type { BurnIn, CutList } from "@video-render/cut-list"
import { withStamp } from "@video-render/stamp"
import { cutList, shot } from "@video-render/testing"
import { describe, expect, it } from "vitest"

const STAMP = { sources: ["paulgsc/dotfiles@91cb11b"], date: "2026-11-13" }

const terminal: BurnIn = {
  kind: "terminal",
  params: { title: "T", lines: [{ text: "x" }] },
}
const headline: BurnIn = { kind: "headline", params: {} }

const problems = (raw: unknown): ReadonlyArray<string> => {
  const p = parseCutList(raw)
  return p.ok ? [] : p.problems
}

const parsed = (raw: unknown): CutList => {
  const p = parseCutList(raw)
  if (!p.ok) throw new Error(p.problems.join("; "))
  return p.value
}

describe("the stamp", () => {
  it("is given to every card from the cut list's one stamp, and to nothing else", () => {
    const cut = parsed(
      cutList(
        [
          shot("S1", { burnIns: [terminal, headline] }),
          shot("S2", { burnIns: [{ kind: "rule", params: { title: "R" } }] }),
        ],
        { stamp: STAMP }
      )
    )
    const stamped = withStamp(
      cut,
      cut.shots.map((s) => s.burnIns)
    )
    expect(stamped.map((s) => s.map((b) => b.params["stamp"]))).toEqual([
      [STAMP, undefined],
      [STAMP],
    ])
  })

  it("is refused when a card is in a cut list without one", () => {
    expect(problems(cutList([shot("S1", { burnIns: [terminal] })]))).toEqual([
      "S1: a card is stamped with the commits it was checked against; the cut list has no stamp",
    ])
  })

  it("is never written on a card by hand", () => {
    expect(
      problems(
        cutList(
          [
            shot("S1", {
              burnIns: [
                { ...terminal, params: { ...terminal.params, stamp: STAMP } },
              ],
            }),
          ],
          { stamp: STAMP }
        )
      )
    ).toEqual([
      "S1: a card's stamp is the cut list's; nothing is written for it",
    ])
  })

  it("refuses a card over the whole video", () => {
    expect(
      problems(cutList([shot("S1")], { stamp: STAMP, burnIns: [terminal] }))
    ).toEqual(["a card belongs to a scene, never to the whole video"])
  })

  it.each([
    ["no commit", { sources: ["paulgsc/dotfiles"], date: "2026-11-13" }],
    ["a branch", { sources: ["paulgsc/dotfiles@main"], date: "2026-11-13" }],
    ["no sources", { sources: [], date: "2026-11-13" }],
    ["no day", { sources: ["paulgsc/dotfiles@91cb11b"], date: "Nov 13" }],
  ])("names a commit and a day (%s is refused)", (_, stamp) => {
    expect(problems(cutList([shot("S1")], { stamp })).length).toBeGreaterThan(0)
  })
})
