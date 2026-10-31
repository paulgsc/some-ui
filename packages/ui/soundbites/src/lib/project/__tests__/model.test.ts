/** @vitest-environment node */
import type { ShotTime } from "@some-ui/video-render"
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

/** Shot times as a render writes them: `[id, startMs, durationMs]`. */
function times(
  ...rows: ReadonlyArray<readonly [string, number, number]>
): ReadonlyArray<ShotTime> {
  return rows.map(([id, startMs, durationMs]) => ({
    id,
    cut: null,
    startMs,
    durationMs,
  }))
}

/** Rev 2 and rev 3 rendered with 400 ms crossfades; rev 1 never rendered. */
const RENDERED: Readonly<Record<number, ReadonlyArray<ShotTime>>> = {
  2: times(["a", 0, 1_000], ["b", 600, 2_000], ["c", 2_200, 2_000]),
  3: times(["a", 0, 1_000], ["c", 600, 2_000], ["b", 2_200, 2_000]),
}
const timesOf = (rev: number): ReadonlyArray<ShotTime> | null =>
  RENDERED[rev] ?? null

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
  it("maps onto rev 3 after its shot moves, at the rendered time, and says it moved", () => {
    const state = run(noted(), {
      type: "revised",
      author: "claude",
      message: "c before b",
      at: AT,
      cutList: shape([shot("a", 1_000), shot("c"), shot("b")]),
    })
    const [note] = state.project.notes
    expect(anchorAt(state.project, note!, 2, timesOf)).toMatchObject({
      kind: "here",
      atMs: 2_700,
      moved: false,
    })
    expect(anchorAt(state.project, note!, 3, timesOf)).toEqual({
      kind: "here",
      shot: "c",
      offsetMs: 500,
      atMs: 1_100,
      moved: true,
      clipped: false,
    })
    // Rev 4 isn't rendered yet: the shot is found, its time is not guessed.
    const next = run(state, {
      type: "revised",
      author: "owner",
      message: "Same again",
      at: AT,
      cutList: shape([shot("a", 1_000), shot("c"), shot("b")]),
    })
    expect(anchorAt(next.project, note!, 4, timesOf)).toMatchObject({
      kind: "here",
      offsetMs: 500,
      atMs: null,
      moved: null,
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
    expect(
      anchorAt(state.project, state.project.notes[0]!, 3, timesOf)
    ).toEqual({
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
    expect(
      anchorAt(state.project, state.project.notes[0]!, 3, timesOf)
    ).toMatchObject({
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
    expect(confirmed.project.notes[0]?.reason).toBe(
      "The pause reads as a stall"
    )
    expect(isAppendOnly(declined.project, confirmed.project)).toBe(true)
    // Neither a status walked back nor a reason dropped is a save.
    for (const lossy of [
      { ...confirmed.project.notes[0]!, status: "open" as const },
      { ...confirmed.project.notes[0]!, reason: undefined },
    ])
      expect(
        isAppendOnly(confirmed.project, {
          ...confirmed.project,
          notes: [lossy],
        })
      ).toBe(false)
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

  it("leave the phone only once home holds a copy; Drive's is a copy (LG1)", () => {
    const state = run(
      started(),
      { type: "takeStarted", shot: "a" },
      take("t1", "a")
    )
    const refused = step(state, { type: "letGo", take: "t1" })
    expect(refused.refused).toBe("unconfirmed")
    expect(refused.effects).toEqual([])
    const inDrive = run(state, { type: "keptBy", take: "t1", keeper: "drive" })
    expect(
      step(inDrive, { type: "keptBy", take: "t1", keeper: "drive" }).refused
    ).toBe("duplicate")
    expect(step(inDrive, { type: "letGo", take: "t1" }).refused).toBe(
      "unconfirmed"
    )
    expect(
      isAppendOnly(inDrive.project, {
        ...inDrive.project,
        takes: [{ ...inDrive.project.takes[0]!, onPhone: false }],
      })
    ).toBe(false)

    const kept = run(state, { type: "keptBy", take: "t1", keeper: "home" })
    const released = step(kept, { type: "letGo", take: "t1" })
    // The save lets the audio go, the store checking again in its own
    // transaction.
    expect(released.effects).toEqual([
      { type: "save", project: released.state.project },
    ])
    const confirmed = released.state
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
    // Nor does audio come back, or a take change what it was.
    const back = {
      ...confirmed.project,
      takes: [{ ...confirmed.project.takes[0]!, onPhone: true }],
    }
    expect(isAppendOnly(confirmed.project, back)).toBe(false)
    const longer = {
      ...state.project,
      takes: [{ ...state.project.takes[0]!, durationMs: 9_000 }],
    }
    expect(isAppendOnly(state.project, longer)).toBe(false)
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
      shot: "c",
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
      shot: "c",
    })
    // One write keeps the take's audio with the closed sitting.
    expect(kept.effects).toEqual([
      { type: "keepTake", project: kept.state.project, take: "t1" },
    ])
    expect(kept.state.taking).toBeNull()
  })

  it("closes even when the take under way fails", () => {
    const closing = run(
      started(),
      { type: "sittingOpened", id: "s1", at: AT },
      { type: "takeStarted", shot: "b" },
      { type: "sittingClosed", at: AT, done: "", next: "", shot: null }
    )
    const failed = step(closing, { type: "takeFailed" })
    expect(failed.state.project.sittings[0]?.closedAt).toBe(AT)
    expect(failed.state.project.takes).toEqual([])
  })

  it("keeps when it opened, open or closed", () => {
    const open = run(started(), { type: "sittingOpened", id: "s1", at: AT })
    const moved = {
      ...open.project,
      sittings: [
        { ...open.project.sittings[0]!, openedAt: "2026-10-29T09:00:00.000Z" },
      ],
    }
    expect(isAppendOnly(open.project, moved)).toBe(false)
  })

  it("is one at a time", () => {
    const open = run(started(), { type: "sittingOpened", id: "s1", at: AT })
    expect(
      step(open, { type: "sittingOpened", id: "s2", at: AT }).refused
    ).toBe("sittingOpen")
  })
})
