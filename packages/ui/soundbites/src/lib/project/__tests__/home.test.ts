/** @vitest-environment node */
import {
  heldByHome,
  letGoHeldTakes,
  notesForHome,
} from "@soundbites/lib/project/home"
import type { Project } from "@soundbites/lib/project/model"
import { memoryProjectStore } from "@soundbites/lib/studio/__tests__/fixture"
import { describe, expect, it } from "vitest"

import { AT, run, started, take } from "./fixture"

/** Project p1 with takes t1 (shot a) and t2 (shot b), both on the phone. */
function twoTakes(): Project {
  return run(
    started(),
    { type: "takeStarted", shot: "a" },
    take("t1", "a"),
    { type: "takeStarted", shot: "b" },
    take("t2", "b")
  ).project
}

describe("Studio's takes on their way home", () => {
  it("tells home each take still on the phone, by project, shot and take", () => {
    expect(notesForHome([twoTakes()])).toEqual([
      {
        id: "t1",
        ref: "p1:a:t1",
        at: AT,
        contentType: "audio/webm",
        project: "p1",
      },
      {
        id: "t2",
        ref: "p1:b:t2",
        at: AT,
        contentType: "audio/webm",
        project: "p1",
      },
    ])
  })

  it("marks a take home holds as kept there and lets its audio go, and only that take", () => {
    const after = heldByHome(twoTakes(), new Set(["t1", "elsewhere"]))
    expect(after?.takes).toEqual([
      expect.objectContaining({ id: "t1", keptBy: ["home"], onPhone: false }),
      expect.objectContaining({ id: "t2", keptBy: [], onPhone: true }),
    ])
    expect(after && notesForHome([after]).map((note) => note.id)).toEqual([
      "t2",
    ])
    expect(heldByHome(twoTakes(), new Set(["elsewhere"]))).toBeNull()
  })

  it("lets the audio go from the store in the write that marks it", async () => {
    const memory = memoryProjectStore([twoTakes()])
    expect(await letGoHeldTakes(memory.store, new Set(["t2"]))).toBe(1)
    expect([...memory.audio.keys()]).toEqual(["p1:t1"])
    expect(await letGoHeldTakes(memory.store, new Set(["t2"]))).toBe(0)
  })
})
