/** @vitest-environment node */
import { mergeIn } from "@soundbites/lib/project/merge"
import type { Project, ProjectEvent } from "@soundbites/lib/project/model"
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

  it("is refused when the phone made a version after the file was shared", () => {
    const kept = shared()
    const here = run(
      { project: kept, taking: null, closing: null },
      revised("Shape: calm")
    ).project
    const back = run(
      { project: kept, taking: null, closing: null },
      revised("Claude's cut")
    ).project
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
