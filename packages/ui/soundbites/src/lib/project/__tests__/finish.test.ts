/** @vitest-environment node */
import { BEST_OF, finishOf } from "@soundbites/lib/project/finish"
import { latestShot } from "@soundbites/lib/project/lookup"
import type { FactCheck, ProjectState } from "@soundbites/lib/project/model"
import { isAppendOnly, latest, step } from "@soundbites/lib/project/model"
import { describe, expect, it } from "vitest"

import { AT, run, shape, shot, started, take } from "./fixture"

const LINK = "https://youtu.be/dQw4w9WgXcQ"

/** Every scene of `state` taken, in order. */
function takenOnly(state: ProjectState): ProjectState {
  return ["a", "b", "c"].reduce(
    (at, id) => run(at, { type: "takeStarted", shot: id }, take(`t-${id}`, id)),
    state
  )
}

/** The owner's word that each of `ids` is as the latest version has it. */
const said = (state: ProjectState, ids: ReadonlyArray<string>): ProjectState =>
  ids.reduce((at, id) => {
    const idea = latestShot(at.project, id)?.idea ?? { origin: "agent" }
    return run(at, { type: "originSaid", shot: id, idea, at: AT })
  }, state)

/** Every scene of `state` taken, and whose idea each is said. */
const taken = (state: ProjectState): ProjectState =>
  said(takenOnly(state), ["a", "b", "c"])

const marked = (state: ProjectState, rev = 1): ProjectState =>
  run(state, { type: "markedReady", rev, at: AT })

describe("Finish's ready rule", () => {
  it("names the first scene with no kept take", () => {
    const state = run(
      started(),
      { type: "takeStarted", shot: "a" },
      take("t-a", "a")
    )
    expect(finishOf(state.project)).toEqual({
      kind: "take",
      rev: 1,
      shot: "b",
      n: 2,
    })
  })

  it("names an open note before any scene, and is ready again once it is settled", () => {
    const noted = run(marked(taken(started())), {
      type: "noted",
      note: {
        id: "n1",
        rev: 1,
        shot: "b",
        offsetMs: 500,
        author: "owner",
        text: "Louder here",
      },
    })
    expect(finishOf(noted.project)).toMatchObject({
      kind: "note",
      note: { id: "n1" },
    })
    const settled = run(noted, {
      type: "noteSettled",
      id: "n1",
      status: "applied",
    })
    expect(finishOf(settled.project)).toEqual({ kind: "ready", rev: 1 })
  })

  it("waits on the owner's mark once nothing else is missing", () => {
    const state = taken(started())
    expect(finishOf(state.project)).toEqual({ kind: "unmarked", rev: 1 })
    expect(finishOf(marked(state).project)).toEqual({ kind: "ready", rev: 1 })
  })

  it("waits on whose idea each scene is before the mark, naming the first and how many", () => {
    const state = said(takenOnly(started()), ["a"])
    expect(finishOf(state.project)).toEqual({
      kind: "idea",
      rev: 1,
      shot: "b",
      n: 2,
      count: 2,
    })
    expect(step(state, { type: "markedReady", rev: 1, at: AT }).refused).toBe(
      "notReady"
    )
    expect(finishOf(said(state, ["b", "c"]).project)).toEqual({
      kind: "unmarked",
      rev: 1,
    })
  })

  it("asks again only of a scene whose idea a later version changed", () => {
    const confirmed = taken(started())
    const { cutList } = latest(confirmed.project)
    const later = run(confirmed, {
      type: "revised",
      author: "claude",
      message: "Scene b is from your week 8 picks",
      at: AT,
      cutList: {
        ...cutList,
        shots: cutList.shots.map((each) =>
          each.id === "b"
            ? {
                ...each,
                durationMs: 2_400,
                idea: {
                  origin: "source",
                  from: { title: "Week 8 picks", ref: "w8" },
                },
              }
            : { ...each, durationMs: 2_200 }
        ),
      },
    })
    expect(finishOf(later.project)).toEqual({
      kind: "idea",
      rev: 2,
      shot: "b",
      n: 2,
      count: 1,
    })
  })

  it("leaves a version marked ready before it waited on whose idea each scene is", () => {
    const { project } = takenOnly(started())
    const markedBefore = { ...project, ready: [{ rev: 1, at: AT }] }
    expect(finishOf(markedBefore)).toEqual({ kind: "ready", rev: 1 })
    const state = { project: markedBefore, taking: null, closing: null }
    expect(
      step(state, { type: "released", rev: 1, url: LINK, at: AT }).refused
    ).toBeNull()
  })

  it("refuses a mark while something is missing, or on an older revision", () => {
    expect(
      step(started(), { type: "markedReady", rev: 1, at: AT }).refused
    ).toBe("notReady")
    const later = run(taken(started()), {
      type: "revised",
      author: "owner",
      message: "Calmer",
      at: AT,
      cutList: shape([shot("a"), shot("b"), shot("c")]),
    })
    expect(step(later, { type: "markedReady", rev: 1, at: AT }).refused).toBe(
      "notLatest"
    )
  })
})

/** `state` as an episode of the show Weekly (SH3's pins), its takes' checks as given. */
function episode(
  state: ProjectState,
  checks: ReadonlyArray<FactCheck> = []
): ProjectState {
  return {
    ...state,
    project: {
      ...state.project,
      episode: {
        schema: "some-ui.show-episode/1",
        show: "Weekly",
        format: { id: "weekly", version: 1 },
        period: "week 3",
        data: { source: "weekly/3.json", sha256: "a".repeat(64) },
        upload: { title: "Weekly · week 3", description: "Week 3." },
      },
      checks,
    },
  }
}

const check = (take: string, passed: boolean, at = AT): FactCheck => ({
  take,
  at,
  passed,
})

/** Scene `id` taken again as take `t-<id>-<n>`, so it is the one chosen. */
const retaken = (state: ProjectState, id: string, n: number): ProjectState =>
  run(state, { type: "takeStarted", shot: id }, take(`t-${id}-${n}`, id))

describe("Finish on an episode (SH5): no take says a fact wrong", () => {
  it("lets a take with no check yet through, until a round writes checks (ST8)", () => {
    const state = episode(taken(started()), [check("t-a", true)])
    expect(finishOf(state.project)).toEqual({ kind: "unmarked", rev: 1 })
    expect(finishOf(episode(taken(started())).project)).toEqual({
      kind: "unmarked",
      rev: 1,
    })
  })

  it("names a take whose check didn't pass, and how many of the scene's takes didn't", () => {
    const state = episode(taken(started()), [
      check("t-a", true),
      check("t-b", false),
      check("t-c", true),
    ])
    expect(finishOf(state.project)).toEqual({
      kind: "facts",
      rev: 1,
      shot: "b",
      n: 2,
      rounds: 1,
    })
  })

  it("reads a take's latest check: a later pass counts", () => {
    const state = episode(taken(started()), [
      check("t-a", false),
      check("t-a", true),
      check("t-b", true),
      check("t-c", true),
    ])
    expect(finishOf(state.project)).toEqual({ kind: "unmarked", rev: 1 })
    expect(finishOf(marked(state).project)).toEqual({ kind: "ready", rev: 1 })
  })

  it("reads a take's latest check by when it ran, whatever order a merge brought it in", () => {
    // Later in time, though it reads as earlier text: 00.5 seconds past.
    const later = "2026-10-30T09:00:00.500Z"
    const earlier = "2026-10-30T09:00:00Z"
    const passed = [check("t-a", true), check("t-c", true)]
    const failedLast = episode(taken(started()), [
      ...passed,
      check("t-b", false, later),
      check("t-b", true, earlier),
    ])
    expect(finishOf(failedLast.project)).toMatchObject({
      kind: "facts",
      shot: "b",
    })
    const passedLast = episode(taken(started()), [
      ...passed,
      check("t-b", true, later),
      check("t-b", false, earlier),
    ])
    expect(finishOf(passedLast.project)).toEqual({ kind: "unmarked", rev: 1 })
  })

  it("lets the owner keep the chosen take after three rounds, and not before", () => {
    const two = episode(retaken(taken(started()), "b", 2), [
      check("t-a", true),
      check("t-b", false),
      check("t-b-2", false),
      check("t-c", true),
    ])
    const early = step(two, { type: "bestKept", shot: "b", at: AT })
    expect(early.refused).toBe("notReady")

    const three = retaken(two, "b", 3)
    const checked: ProjectState = {
      ...three,
      project: {
        ...three.project,
        checks: [...(three.project.checks ?? []), check("t-b-3", false)],
      },
    }
    expect(finishOf(checked.project)).toMatchObject({
      kind: "facts",
      shot: "b",
      rounds: BEST_OF,
    })
    const kept = step(checked, { type: "bestKept", shot: "b", at: AT })
    expect(kept.refused).toBeNull()
    expect(kept.state.project.accepted).toEqual([
      { shot: "b", take: "t-b-3", at: AT },
    ])
    expect(isAppendOnly(checked.project, kept.state.project)).toBe(true)
    expect(finishOf(kept.state.project)).toEqual({ kind: "unmarked", rev: 1 })
    // Only what was kept: another take chosen there that fails is named again.
    const again = retaken(kept.state, "b", 4)
    expect(finishOf(again.project)).toEqual({ kind: "unmarked", rev: 1 })
    const failed: ProjectState = {
      ...again,
      project: {
        ...again.project,
        checks: [...(again.project.checks ?? []), check("t-b-4", false)],
      },
    }
    expect(finishOf(failed.project)).toMatchObject({
      kind: "facts",
      shot: "b",
      rounds: BEST_OF + 1,
    })
  })

  it("asks a video of your own for no check", () => {
    expect(finishOf(taken(started()).project)).toEqual({
      kind: "unmarked",
      rev: 1,
    })
  })

  it("never lets a check or the owner's word go", () => {
    const state = episode(taken(started()), [check("t-a", true)])
    expect(isAppendOnly(state.project, { ...state.project, checks: [] })).toBe(
      false
    )
  })
})

describe("a release", () => {
  it("keeps the pasted link on a revision marked ready, once", () => {
    const ready = marked(taken(started()))
    expect(
      step(taken(started()), { type: "released", rev: 1, url: LINK, at: AT })
        .refused
    ).toBe("notReady")
    const released = run(ready, {
      type: "released",
      rev: 1,
      url: LINK,
      at: AT,
    })
    expect(finishOf(released.project)).toEqual({
      kind: "released",
      rev: 1,
      url: LINK,
    })
    expect(
      step(released, { type: "released", rev: 1, url: LINK, at: AT }).refused
    ).toBe("duplicate")
  })

  it("is never edited: its revision takes no note, and a change makes the next one", () => {
    const released = run(marked(taken(started())), {
      type: "released",
      rev: 1,
      url: LINK,
      at: AT,
    })
    const note = {
      id: "n1",
      rev: 1,
      shot: "a",
      offsetMs: 0,
      author: "owner" as const,
      text: "Too quiet",
    }
    expect(step(released, { type: "noted", note }).refused).toBe("released")
    const next = run(released, {
      type: "revised",
      author: "owner",
      message: "Louder",
      at: AT,
      cutList: shape([shot("a"), shot("b"), shot("c")]),
    })
    expect(finishOf(next.project)).toEqual({ kind: "unmarked", rev: 2 })
    expect(next.project.released).toEqual(released.project.released)
    expect(
      isAppendOnly(released.project, { ...next.project, released: [] })
    ).toBe(false)
  })

  it("is refused when a note opened after the mark, until it is settled", () => {
    const noted = run(marked(taken(started())), {
      type: "noted",
      note: {
        id: "n1",
        rev: 1,
        shot: "a",
        offsetMs: 0,
        author: "owner",
        text: "Too quiet",
      },
    })
    const release = { type: "released", rev: 1, url: LINK, at: AT } as const
    expect(step(noted, release).refused).toBe("notReady")
    const settled = run(noted, {
      type: "noteSettled",
      id: "n1",
      status: "applied",
    })
    expect(step(settled, release).refused).toBeNull()
  })

  it("is refused for anything but a YouTube video's link", () => {
    expect(
      step(marked(taken(started())), {
        type: "released",
        rev: 1,
        url: "https://example.com/watch?v=dQw4w9WgXcQ",
        at: AT,
      }).refused
    ).toBe("noLink")
  })
})
