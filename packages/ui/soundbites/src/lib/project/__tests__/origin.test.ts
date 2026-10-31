/** @vitest-environment node */
import type { Idea } from "@some-ui/video-render"
import { authorshipOf, parseCutList } from "@some-ui/video-render"
import { projectFile, readProjectFile } from "@soundbites/lib/project/file"
import { mergeIn } from "@soundbites/lib/project/merge"
import type { Project, ProjectState } from "@soundbites/lib/project/model"
import {
  cutListAt,
  isAppendOnly,
  latest,
  step,
} from "@soundbites/lib/project/model"
import {
  originConfirmed,
  originsToConfirm,
} from "@soundbites/lib/project/origin"
import { describe, expect, it } from "vitest"

import { AT, run, shape, shot, started, take } from "./fixture"

const LATER = "2026-10-30T10:00:00.000Z"

/** `state`'s latest version with scene `id`'s idea set, as `author` made it. */
function withIdea(
  state: ProjectState,
  id: string,
  idea: Idea,
  author: "owner" | "claude" = "owner"
): ProjectState {
  const { cutList } = latest(state.project)
  return run(state, {
    type: "revised",
    author,
    message: `Scene ${id}'s idea`,
    at: LATER,
    cutList: {
      ...cutList,
      shots: cutList.shots.map((each) =>
        each.id === id ? { ...each, idea } : each
      ),
    },
  })
}

const said = (id: string, idea: Idea) =>
  ({ type: "originSaid", shot: id, idea, at: LATER }) as const

describe("the owner's word on whose idea a scene is (ST5)", () => {
  it("is a mark kept for good, of the latest version, and the scene stands confirmed", () => {
    const before = started()
    expect(originsToConfirm(before.project)).toBe(3)
    const next = step(before, said("a", { origin: "agent" }))
    expect(next.refused).toBeNull()
    const { project } = next.state
    expect(project.origins).toEqual([
      { shot: "a", rev: 1, at: LATER, idea: { origin: "agent" } },
    ])
    expect(project.revisions).toEqual(before.project.revisions)
    expect(originConfirmed(project, "a")).toBe(true)
    expect(originsToConfirm(project)).toBe(2)
    expect(next.effects).toEqual([{ type: "save", project }])
    expect(isAppendOnly(before.project, project)).toBe(true)
  })

  it("is never changed or dropped once kept", () => {
    const { project } = run(started(), said("a", { origin: "agent" }))
    const dropped: Project = { ...project, origins: [] }
    const changed: Project = {
      ...project,
      origins: [
        {
          shot: "a",
          rev: 1,
          at: AT,
          idea: { origin: "agent" },
        },
      ],
    }
    expect(isAppendOnly(project, dropped)).toBe(false)
    expect(isAppendOnly(project, changed)).toBe(false)
  })

  it("says only what the latest version says, of a scene it has, once", () => {
    const state = started()
    const yours: Idea = { origin: "you", from: { kind: "take", id: "t1" } }
    expect(step(state, said("a", yours)).refused).toBe("otherIdea")
    expect(step(state, said("z", { origin: "agent" })).refused).toBe("noShot")
    const once = run(state, said("a", { origin: "agent" }))
    expect(step(once, said("a", { origin: "agent" })).refused).toBe("duplicate")
  })

  it("is asked again once a later version gives the scene another idea", () => {
    const confirmed = run(started(), said("a", { origin: "agent" }))
    const moved = withIdea(
      confirmed,
      "a",
      { origin: "source", from: { title: "Week 8 picks", ref: "w8" } },
      "claude"
    )
    expect(originConfirmed(moved.project, "a")).toBe(false)
    expect(originsToConfirm(moved.project)).toBe(3)
  })

  describe("yours cites the owner's own words", () => {
    it("a take the owner recorded", () => {
      const taken = run(
        started(),
        { type: "takeStarted", shot: "a" },
        take("t1", "a")
      )
      const yours: Idea = { origin: "you", from: { kind: "take", id: "t1" } }
      expect(
        step(withIdea(taken, "a", yours), said("a", yours)).refused
      ).toBeNull()
      const none: Idea = { origin: "you", from: { kind: "take", id: "t9" } }
      expect(step(withIdea(taken, "a", none), said("a", none)).refused).toBe(
        "notYours"
      )
    })

    it("words the owner wrote, kept as a note confirmed as written, never Claude's note", () => {
      const yours: Idea = { origin: "you", from: { kind: "note", id: "n1" } }
      const cited = withIdea(started(), "a", yours)
      const worded = run(cited, {
        type: "worded",
        note: {
          id: "n1",
          rev: 2,
          shot: "a",
          offsetMs: 300,
          text: "On the bus",
        },
      })
      expect(worded.project.notes).toEqual([
        {
          id: "n1",
          rev: 2,
          shot: "a",
          offsetMs: 300,
          author: "owner",
          text: "On the bus",
          status: "confirmed",
        },
      ])
      expect(step(worded, said("a", yours)).refused).toBeNull()
      const claudes = run(cited, {
        type: "noted",
        note: {
          id: "n1",
          rev: 2,
          shot: "a",
          offsetMs: 300,
          author: "claude",
          text: "Claude's thought",
        },
      })
      expect(step(claudes, said("a", yours)).refused).toBe("notYours")
    })

    it("an idea's answer only where Claude's version gave it the scene", () => {
      const answer: Idea = {
        origin: "you",
        from: { kind: "idea", id: "i1/what" },
      }
      expect(
        step(withIdea(started(), "a", answer, "owner"), said("a", answer))
          .refused
      ).toBe("notYours")
      expect(
        step(withIdea(started(), "a", answer, "claude"), said("a", answer))
          .refused
      ).toBeNull()
    })
  })

  it("reaches the cut list the renderer reads, and the authorship mark says yours", () => {
    const yours: Idea = { origin: "you", from: { kind: "note", id: "n1" } }
    const { project } = run(
      withIdea(started(), "a", yours),
      {
        type: "worded",
        note: { id: "n1", rev: 2, shot: "a", offsetMs: 0, text: "Mine" },
      },
      said("a", yours)
    )
    const cut = parseCutList(cutListAt(project, latest(project).rev))
    if (!cut.ok) throw new Error(cut.problems.join("; "))
    expect(authorshipOf(cut.value).map((each) => each.origin)).toEqual([
      "you",
      "agent",
      "agent",
    ])
  })

  it("travels in the project file, which refuses a mark its version doesn't bear out", () => {
    const { project } = run(started(), said("b", { origin: "agent" }))
    const read = readProjectFile(projectFile(project))
    expect(read.ok && read.value.origins).toEqual(project.origins)
    const wrong: Project = {
      ...project,
      origins: [
        {
          shot: "b",
          rev: 1,
          at: LATER,
          idea: { origin: "source", from: { title: "Elsewhere", ref: "x" } },
        },
      ],
    }
    const refused = readProjectFile(projectFile(wrong))
    expect(refused.ok).toBe(false)
    expect(refused.ok ? [] : refused.problems).toEqual([
      "origins.0: rev 1 gives shot b another idea",
    ])
  })

  it("stays the phone's own when Claude's version comes back", () => {
    const shared = started().project
    const { project: kept } = run(
      { project: shared, taking: null, closing: null },
      said("a", { origin: "agent" })
    )
    const file: Project = {
      ...shared,
      revisions: [
        ...shared.revisions,
        {
          rev: 2,
          author: "claude",
          message: "Tighter",
          at: LATER,
          cutList: shape([shot("a", 1_500), shot("b"), shot("c")]),
        },
      ],
      origins: [],
    }
    const merged = mergeIn(kept, file)
    expect(merged.kind).toBe("merged")
    if (merged.kind !== "merged") return
    expect(merged.project.origins).toEqual(kept.origins)
    expect(originConfirmed(merged.project, "a")).toBe(true)
  })
})
