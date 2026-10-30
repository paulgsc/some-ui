/** @vitest-environment node */
import {
  anchorAt,
  cutListAt,
  isAppendOnly,
  latest,
  step,
} from "@soundbites/lib/project/model"
import { describe, expect, it } from "vitest"

import { AT, run, shape, shot, started, take } from "./fixture"

const NOTE = {
  id: "n1",
  rev: 2,
  shot: "c",
  offsetMs: 500,
  author: "owner",
  text: "Hold here",
} as const

/** Rev 1, then rev 2 as the same three shots, and a note on c at rev 2. */
function noted(): ReturnType<typeof started> {
  return run(
    started(),
    {
      type: "revised",
      author: "claude",
      message: "Tighten a",
      at: AT,
      cutList: shape([shot("a", 1_000), shot("b"), shot("c")]),
    },
    { type: "noted", note: NOTE }
  )
}

describe("a note pinned to a moment", () => {
  it("maps onto rev 3 after its shot moves, and says it moved", () => {
    const state = run(noted(), {
      type: "revised",
      author: "claude",
      message: "c before b",
      at: AT,
      cutList: shape([shot("a", 1_000), shot("c"), shot("b")]),
    })
    const [note] = state.project.notes
    expect(anchorAt(state.project, note!, 2)).toMatchObject({
      kind: "here",
      atMs: 3_500,
      moved: false,
    })
    expect(anchorAt(state.project, note!, 3)).toEqual({
      kind: "here",
      shot: "c",
      offsetMs: 500,
      atMs: 1_500,
      moved: true,
      clipped: false,
    })
  })

  it("says so when its shot is gone", () => {
    const state = run(noted(), {
      type: "revised",
      author: "claude",
      message: "Drop c",
      at: AT,
      cutList: shape([shot("a", 1_000), shot("b")]),
    })
    expect(anchorAt(state.project, state.project.notes[0]!, 3)).toEqual({
      kind: "gone",
      shot: "c",
    })
  })

  it("sits at its shot's end when the shot got shorter than the offset", () => {
    const state = run(noted(), {
      type: "revised",
      author: "claude",
      message: "Trim c",
      at: AT,
      cutList: shape([shot("a", 1_000), shot("b"), shot("c", 300)]),
    })
    expect(anchorAt(state.project, state.project.notes[0]!, 3)).toMatchObject({
      offsetMs: 300,
      clipped: true,
    })
  })

  it("is refused for a shot its revision lacks", () => {
    const refused = step(noted(), {
      type: "noted",
      note: { ...NOTE, id: "n2", rev: 1, shot: "z" },
    })
    expect(refused.refused).toBe("noShot")
    expect(refused.effects).toEqual([])
  })

  it("is declined only with a reason, and confirmed after", () => {
    const state = noted()
    expect(
      step(state, { type: "noteSettled", id: "n1", status: "declined" }).refused
    ).toBe("noReason")
    const declined = run(state, {
      type: "noteSettled",
      id: "n1",
      status: "declined",
      reason: "The pause reads as a stall",
    })
    expect(declined.project.notes[0]).toMatchObject({
      status: "declined",
      reason: "The pause reads as a stall",
    })
    const confirmed = run(declined, {
      type: "noteSettled",
      id: "n1",
      status: "confirmed",
    })
    expect(
      step(confirmed, { type: "noteSettled", id: "n1", status: "applied" })
        .refused
    ).toBe("settled")
  })
})

describe("revisions", () => {
  it("are appended, never overwritten", () => {
    const state = noted()
    const before = state.project.revisions
    const next = run(state, {
      type: "revised",
      author: "owner",
      message: "Again",
      at: AT,
      cutList: shape([shot("a")]),
    })
    expect(next.project.revisions.slice(0, 2)).toEqual(before)
    expect(latest(next.project).rev).toBe(3)
  })

  it("refuses a save that changes or drops a kept revision", () => {
    const { project } = noted()
    const [first, second] = project.revisions
    const changed = {
      ...project,
      revisions: [first!, { ...second!, message: "Something else" }],
    }
    expect(isAppendOnly(project, changed)).toBe(false)
    expect(isAppendOnly(project, { ...project, revisions: [first!] })).toBe(
      false
    )
    expect(isAppendOnly(project, project)).toBe(true)
  })

  it("compile to a cut list with the history up to each", () => {
    const { project } = noted()
    expect(cutListAt(project, 1)).toMatchObject({
      revisions: [{ rev: 1, message: "First cut" }],
      notes: [],
    })
    expect(cutListAt(project, 2)?.notes).toHaveLength(1)
  })
})

describe("takes", () => {
  it("are all kept, the newest chosen, and an older one can be chosen again", () => {
    const state = run(
      started(),
      { type: "takeStarted", shot: "a" },
      take("t1", "a"),
      { type: "takeStarted", shot: "a" },
      take("t2", "a")
    )
    expect(state.project.takes.map((each) => each.id)).toEqual(["t1", "t2"])
    expect(state.project.chosen).toEqual({ a: "t2" })
    expect(
      run(state, { type: "chosen", shot: "a", take: "t1" }).project.chosen
    ).toEqual({ a: "t1" })
  })

  it("leave the phone only once home or Drive holds a copy", () => {
    const state = run(
      started(),
      { type: "takeStarted", shot: "a" },
      take("t1", "a")
    )
    const refused = step(state, { type: "letGo", take: "t1" })
    expect(refused.refused).toBe("unconfirmed")
    expect(refused.effects).toEqual([])

    const confirmed = run(
      state,
      { type: "keptBy", take: "t1", keeper: "home" },
      { type: "letGo", take: "t1" }
    )
    expect(confirmed.project.takes[0]).toMatchObject({
      keptBy: ["home"],
      onPhone: false,
    })
    expect(isAppendOnly(state.project, confirmed.project)).toBe(true)
    // Audio gone with no keeper on record is a loss, never a save.
    const lost = {
      ...state.project,
      takes: [{ ...state.project.takes[0]!, onPhone: false }],
    }
    expect(isAppendOnly(state.project, lost)).toBe(false)
  })
})

describe("a sitting", () => {
  it("closed mid-take keeps the take, then closes", () => {
    const recording = run(
      started(),
      { type: "sittingOpened", id: "s1", at: AT },
      { type: "takeStarted", shot: "b" }
    )
    const closing = step(recording, {
      type: "sittingClosed",
      at: "2026-10-30T09:20:00.000Z",
      done: "Recorded b",
      next: "Record c",
    })
    expect(closing.effects).toEqual([{ type: "finishTake" }])
    expect(closing.state.project.sittings[0]?.closedAt).toBeNull()

    const kept = step(closing.state, take("t1", "b"))
    expect(kept.refused).toBeNull()
    expect(kept.state.project.takes.map((each) => each.id)).toEqual(["t1"])
    expect(kept.state.project.sittings[0]).toMatchObject({
      closedAt: "2026-10-30T09:20:00.000Z",
      done: "Recorded b",
      next: "Record c",
    })
    expect(kept.effects).toEqual([
      { type: "save", project: kept.state.project },
    ])
    expect(kept.state.taking).toBeNull()
  })

  it("closes even when the take under way fails", () => {
    const closing = run(
      started(),
      { type: "sittingOpened", id: "s1", at: AT },
      { type: "takeStarted", shot: "b" },
      { type: "sittingClosed", at: AT, done: "", next: "" }
    )
    const failed = step(closing, { type: "takeFailed" })
    expect(failed.state.project.sittings[0]?.closedAt).toBe(AT)
    expect(failed.state.project.takes).toEqual([])
  })

  it("is one at a time", () => {
    const open = run(started(), { type: "sittingOpened", id: "s1", at: AT })
    expect(
      step(open, { type: "sittingOpened", id: "s2", at: AT }).refused
    ).toBe("sittingOpen")
  })
})
