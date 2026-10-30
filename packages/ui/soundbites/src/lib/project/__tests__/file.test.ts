/** @vitest-environment node */
import { projectFile, readProjectFile } from "@soundbites/lib/project/file"
import { isAppendOnly } from "@soundbites/lib/project/model"
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
  it("reads back as the project it was written from, and saves over it", () => {
    const project = worked()
    const read = readProjectFile(projectFile(project))
    expect(read).toEqual({ ok: true, value: project })
    // Keys come back in another order; the store still takes it as the same.
    if (!read.ok) throw new Error("unread")
    expect(isAppendOnly(project, read.value)).toBe(true)
    expect(isAppendOnly(read.value, project)).toBe(true)
  })

  it("carries a revision's ready mark and release (ST7)", () => {
    const project = {
      ...worked(),
      ready: [{ rev: 1, at: AT }],
      released: [{ rev: 1, at: AT, url: "https://youtu.be/dQw4w9WgXcQ" }],
    }
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
    const odd = {
      ...project,
      notes: [...project.notes, { ...project.notes[0]!, rev: 9 }],
      takes: [...project.takes, ...project.takes],
    }
    const oddRead = readProjectFile(JSON.stringify(odd))
    expect(oddRead.ok ? [] : oddRead.problems).toEqual([
      "notes.n1: rev 9 has no shot b",
      "notes: n1 is listed twice",
      "takes: t1 is listed twice",
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
