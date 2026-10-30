/** @vitest-environment node */
import type { Review } from "@some-ui/video-render"
import { REVIEW_SCHEMA } from "@some-ui/video-render"
import {
  AT,
  run,
  shape,
  shot,
  started,
} from "@soundbites/lib/project/__tests__/fixture"
import type { ProjectState } from "@soundbites/lib/project/model"
import { anchorAt } from "@soundbites/lib/project/model"
import { askedAt, changesIn, shotAt } from "@soundbites/lib/studio/watch"
import { describe, expect, it } from "vitest"

/** A render of `rev`: scenes a, b, c of `lengths` ms, each 200 ms over the last. */
function review(rev: number, lengths: ReadonlyArray<number>): Review {
  let start = 0
  const shotTimes = ["a", "b", "c"].map((id, index) => {
    const at = start
    const durationMs = lengths[index] ?? 0
    start += durationMs - 200
    return { id, cut: null, startMs: at, durationMs }
  })
  return { schema: REVIEW_SCHEMA, rev, shotTimes }
}

const REV3 = review(3, [60_000, 60_000, 60_000])
const REV4 = review(4, [30_000, 60_000, 60_000])

/** A project at rev 3, its scenes as long as REV3's. */
function atRev3(): ProjectState {
  const cut = shape([shot("a", 60_000), shot("b", 60_000), shot("c", 60_000)])
  const revised = (message: string, cutList = cut) =>
    ({ type: "revised", author: "claude", message, at: AT, cutList }) as const
  return run(started(), revised("2"), revised("3"))
}

describe("a note made while watching", () => {
  it("made at 1:31 on rev 3 lands on its scene, and shows at its new time on rev 4", () => {
    const here = shotAt(REV3, 91_000)
    expect(here).toEqual({ shot: "b", offsetMs: 31_200 })
    if (here === null) return
    const noted = run(atRev3(), {
      type: "noted",
      note: { id: "n1", rev: 3, ...here, author: "owner", text: "Too fast" },
    })
    const next = run(noted, {
      type: "revised",
      author: "claude",
      message: "Scene 1 shorter",
      at: AT,
      cutList: shape([shot("a", 30_000), shot("b", 60_000), shot("c", 60_000)]),
    })
    const [note] = next.project.notes
    if (note === undefined) throw new Error("no note")
    const times = (rev: number): Review["shotTimes"] | null =>
      rev === 3 ? REV3.shotTimes : rev === 4 ? REV4.shotTimes : null
    expect(anchorAt(next.project, note, 4, times)).toEqual({
      kind: "here",
      shot: "b",
      offsetMs: 31_200,
      clipped: false,
      atMs: 29_800 + 31_200,
      moved: true,
    })
  })

  it("is on the later scene where two overlap", () => {
    expect(shotAt(REV3, 59_900)).toEqual({ shot: "b", offsetMs: 100 })
    expect(shotAt(REV3, 1_000_000)).toBeNull()
  })
})

describe("Claude's changes, asked as the playhead reaches them", () => {
  it("asks each applied note once it plays, in order, until answered", () => {
    const state = run(
      atRev3(),
      {
        type: "noted",
        note: {
          id: "n1",
          rev: 2,
          shot: "c",
          offsetMs: 1_000,
          author: "owner",
          text: "Cut the pause",
        },
      },
      { type: "noteSettled", id: "n1", status: "applied" },
      {
        type: "noted",
        note: {
          id: "n2",
          rev: 3,
          shot: "a",
          offsetMs: 0,
          author: "owner",
          text: "Not this one: it is this revision's",
        },
      },
      { type: "noteSettled", id: "n2", status: "applied" }
    )
    const changes = changesIn(state.project, REV3)
    expect(changes.map((each) => [each.note.id, each.atMs])).toEqual([
      ["n1", 119_600 + 1_000],
    ])
    expect(askedAt(changes, 100_000, [])).toBeNull()
    expect(askedAt(changes, 121_000, [])?.id).toBe("n1")
    expect(askedAt(changes, 121_000, ["n1"])).toBeNull()
  })
})
