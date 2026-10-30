/** @vitest-environment node */
import { mergeIn } from "@soundbites/lib/project/merge"
import type { Project, ProjectEvent } from "@soundbites/lib/project/model"
import { latest } from "@soundbites/lib/project/model"
import { describe, expect, it } from "vitest"

import { AT, run, shape, shot, started, take } from "./fixture"

const note = (id: string, author: "owner" | "claude"): ProjectEvent => ({
  type: "noted",
  note: { id, rev: 1, shot: "b", offsetMs: 300, author, text: "Slower here" },
})

const revised = (message: string): ProjectEvent => ({
  type: "revised",
  author: "claude",
  message,
  at: AT,
  cutList: shape([shot("a"), shot("b", 3_000), shot("c")]),
})

/** What the phone shared: a take on a, and the owner's note on b. */
function shared(): Project {
  return run(
    started(),
    { type: "takeStarted", shot: "a" },
    take("t1", "a"),
    note("n1", "owner")
  ).project
}

describe("a version back from Claude", () => {
  it("adds its revisions and notes, and settles the notes it applied", () => {
    const kept = shared()
    const back = run(
      { project: kept, taking: null, closing: null },
      { type: "noteSettled", id: "n1", status: "applied" },
      revised("Scene 2 slower (n1)"),
      note("n2", "claude")
    ).project
    const merged = mergeIn(kept, back)
    expect(merged.kind).toBe("merged")
    if (merged.kind !== "merged") return
    expect(merged.project.revisions.map((each) => each.message)).toEqual([
      "First cut",
      "Scene 2 slower (n1)",
    ])
    expect(merged.project.notes.map((each) => [each.id, each.status])).toEqual([
      ["n1", "applied"],
      ["n2", "open"],
    ])
  })

  it("never changes the phone's takes, chosen takes or sittings", () => {
    const kept = shared()
    const back: Project = {
      ...run({ project: kept, taking: null, closing: null }, revised("Tighter"))
        .project,
      takes: [],
      chosen: {},
      sittings: [],
    }
    const merged = mergeIn(kept, back)
    if (merged.kind !== "merged") throw new Error(merged.kind)
    expect(merged.project.takes).toEqual(kept.takes)
    expect(merged.project.chosen).toEqual(kept.chosen)
    expect(merged.project.sittings).toEqual(kept.sittings)
  })

  /** A version made on `project`: `shots`, by `author`, saying `message`. */
  const version = (
    project: Project,
    author: "owner" | "claude",
    message: string,
    shots: ReadonlyArray<ReturnType<typeof shot>>
  ): Project =>
    run(
      { project, taking: null, closing: null },
      { type: "revised", author, message, at: AT, cutList: shape(shots) }
    ).project

  /** The phone fitted scene `id` to a take after sharing. */
  const fitted = (kept: Project, id: string): Project =>
    version(
      kept,
      "owner",
      `Take on ${id}`,
      ["a", "b", "c"].map((each) => shot(each, each === id ? 2_500 : 2_000))
    )

  it("comes in after a version made here, numbered after it (#2317)", () => {
    const kept = shared()
    const here = fitted(kept, "a")
    const back = version(kept, "claude", "Scene 2 slower", [
      shot("a"),
      shot("b", 3_000),
      shot("c"),
    ])
    const merged = mergeIn(here, back)
    if (merged.kind !== "merged") throw new Error(merged.kind)
    expect(merged.clashes).toEqual([])
    expect(
      merged.project.revisions.map((each) => [each.rev, each.message])
    ).toEqual([
      [1, "First cut"],
      [2, "Take on a"],
      [3, "Scene 2 slower"],
    ])
    expect(
      latest(merged.project).cutList.shots.map((each) => each.durationMs)
    ).toEqual([2_500, 3_000, 2_000])
  })

  it("keeps the phone's scene where both changed it, names it, and leaves its note open", () => {
    const kept = shared()
    const here = fitted(kept, "b")
    const back = run(
      { project: kept, taking: null, closing: null },
      { type: "noteSettled", id: "n1", status: "applied" }
    ).project
    const merged = mergeIn(
      here,
      version(back, "claude", "Scene 2 slower (n1)", [
        shot("a"),
        shot("b", 3_000),
        shot("c", 1_500),
      ])
    )
    if (merged.kind !== "merged") throw new Error(merged.kind)
    expect(merged.clashes).toEqual([{ shot: "b" }])
    expect(
      latest(merged.project).cutList.shots.map((each) => each.durationMs)
    ).toEqual([2_000, 2_500, 1_500])
    expect(merged.project.notes.find((each) => each.id === "n1")?.status).toBe(
      "open"
    )
  })

  it("numbers Claude's new notes by where its versions landed", () => {
    const kept = shared()
    const here = fitted(kept, "a")
    const back = run(
      {
        project: version(kept, "claude", "Tighter", [
          shot("a"),
          shot("b", 1_500),
          shot("c"),
        ]),
        taking: null,
        closing: null,
      },
      {
        type: "noted",
        note: {
          id: "n2",
          rev: 2,
          shot: "b",
          offsetMs: 100,
          author: "claude",
          text: "Check this",
        },
      }
    ).project
    const merged = mergeIn(here, back)
    if (merged.kind !== "merged") throw new Error(merged.kind)
    expect(merged.project.notes.find((each) => each.id === "n2")?.rev).toBe(3)
  })

  it("brings nothing twice when the same file is opened again", () => {
    const kept = shared()
    const back = version(kept, "claude", "Scene 2 slower", [
      shot("a"),
      shot("b", 3_000),
      shot("c"),
    ])
    const once = mergeIn(fitted(kept, "a"), back)
    if (once.kind !== "merged") throw new Error(once.kind)
    expect(mergeIn(once.project, back)).toEqual({ kind: "same" })
  })

  it("still leaves a clashed scene's note open when the same file is opened again", () => {
    const kept = shared()
    const back = run(
      { project: kept, taking: null, closing: null },
      { type: "noteSettled", id: "n1", status: "applied" }
    ).project
    const file = version(back, "claude", "Scene 2 slower (n1)", [
      shot("a"),
      shot("b", 3_000),
      shot("c", 1_500),
    ])
    const once = mergeIn(fitted(kept, "b"), file)
    if (once.kind !== "merged") throw new Error(once.kind)
    const twice = mergeIn(once.project, file)
    expect(twice).toEqual({ kind: "same" })
  })

  it("takes a scene one side added while the other changed another", () => {
    const kept = shared()
    const added = version(kept, "claude", "With d", [
      shot("a"),
      shot("b"),
      shot("c"),
      shot("d", 1_000),
    ])
    const merged = mergeIn(fitted(kept, "b"), added)
    if (merged.kind !== "merged") throw new Error(merged.kind)
    expect(
      latest(merged.project).cutList.shots.map((each) => [
        each.id,
        each.durationMs,
      ])
    ).toEqual([
      ["a", 2_000],
      ["b", 2_500],
      ["c", 2_000],
      ["d", 1_000],
    ])
    const here = version(kept, "owner", "With e", [
      shot("a"),
      shot("b"),
      shot("c"),
      shot("e", 1_200),
    ])
    const back = version(kept, "claude", "Scene 2 slower", [
      shot("a"),
      shot("b", 3_000),
      shot("c"),
    ])
    const other = mergeIn(here, back)
    if (other.kind !== "merged") throw new Error(other.kind)
    expect(latest(other.project).cutList.shots.map((each) => each.id)).toEqual([
      "a",
      "b",
      "c",
      "e",
    ])
  })

  it("is refused when both changed which scenes the video has", () => {
    const kept = shared()
    const here = version(kept, "owner", "Without c", [shot("a"), shot("b")])
    const back = version(kept, "claude", "With d", [
      shot("a"),
      shot("b"),
      shot("c"),
      shot("d"),
    ])
    expect(mergeIn(here, back)).toEqual({ kind: "moved" })
  })

  it("is refused when one side removed a scene the other changed", () => {
    const kept = shared()
    const here = version(kept, "owner", "Without c", [shot("a"), shot("b")])
    const back = version(kept, "claude", "c longer", [
      shot("a"),
      shot("b"),
      shot("c", 4_000),
    ])
    expect(mergeIn(here, back)).toEqual({ kind: "moved" })
  })

  it("says so when the file holds nothing new", () => {
    expect(mergeIn(shared(), shared())).toEqual({ kind: "same" })
  })

  it("keeps a note's status where the phone moved it further", () => {
    const kept = run(
      { project: shared(), taking: null, closing: null },
      { type: "noteSettled", id: "n1", status: "applied" },
      { type: "noteSettled", id: "n1", status: "confirmed" }
    ).project
    const back = run(
      { project: shared(), taking: null, closing: null },
      { type: "noteSettled", id: "n1", status: "applied" }
    ).project
    expect(mergeIn(kept, back)).toEqual({ kind: "same" })
  })
})
