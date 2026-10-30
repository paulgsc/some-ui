/** @vitest-environment node */
import { projectFile, readProjectFile } from "@soundbites/lib/project/file"
import { describe, expect, it } from "vitest"

import { AT, run, shape, shot, started, take } from "./fixture"

function worked(): ReturnType<typeof started>["project"] {
  return run(
    started(),
    { type: "sittingOpened", id: "s1", at: AT },
    { type: "takeStarted", shot: "a" },
    take("t1", "a"),
    {
      type: "noted",
      note: {
        id: "n1",
        rev: 1,
        shot: "b",
        offsetMs: 400,
        author: "owner",
        text: "Show the list here",
      },
    },
    {
      type: "revised",
      author: "claude",
      message: "Note n1",
      at: AT,
      cutList: shape([shot("a"), shot("b", 3_000), shot("c")]),
    }
  ).project
}

describe("the project file", () => {
  it("reads back as the project it was written from", () => {
    const project = worked()
    expect(readProjectFile(projectFile(project))).toEqual({
      ok: true,
      value: project,
    })
  })

  it("names every reason a file can't be resumed from", () => {
    const project = worked()
    const broken = {
      ...project,
      revisions: [project.revisions[1], project.revisions[0]],
      chosen: { b: "t1" },
    }
    const read = readProjectFile(JSON.stringify(broken))
    expect(read.ok).toBe(false)
    expect(read.ok ? [] : read.problems).toEqual([
      "revisions.0: expected rev 1",
      "revisions.1: expected rev 2",
      "chosen.b: no take t1 for that shot",
    ])
    expect(readProjectFile("{")).toEqual({ ok: false, problems: ["not JSON"] })
  })

  it("refuses a revision the renderer couldn't draw", () => {
    const project = worked()
    const [first] = project.revisions
    const twice = {
      ...project,
      revisions: [
        {
          ...first,
          cutList: { ...first!.cutList, shots: [shot("a"), shot("a")] },
        },
      ],
      notes: [],
      chosen: {},
    }
    const read = readProjectFile(JSON.stringify(twice))
    expect(read.ok ? [] : read.problems).toEqual([
      "rev 1: a: two scenes share this id",
    ])
  })
})
