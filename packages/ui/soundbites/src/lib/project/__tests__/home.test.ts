/** @vitest-environment node */
import {
  heldByHome,
  letGoHeldTakes,
  notesForHome,
} from "@soundbites/lib/project/home"
import { memoryProjectStore } from "@soundbites/lib/project/memory-store"
import type { Project } from "@soundbites/lib/project/model"
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

  it("marks a take home holds as kept there and lets its audio go where allowed, and only that take", () => {
    const all = (): boolean => true
    const after = heldByHome(twoTakes(), new Set(["t1", "elsewhere"]), all)
    expect(after?.takes).toEqual([
      expect.objectContaining({ id: "t1", keptBy: ["home"], onPhone: false }),
      expect.objectContaining({ id: "t2", keptBy: [], onPhone: true }),
    ])
    expect(after && notesForHome([after]).map((note) => note.id)).toEqual([
      "t2",
    ])
    expect(heldByHome(twoTakes(), new Set(["elsewhere"]), all)).toBeNull()
  })

  it("lets the audio go from the store in the write that marks it, once the owner chose home", async () => {
    const memory = memoryProjectStore([twoTakes()])
    expect(await letGoHeldTakes(memory.store, new Set(["t2"]), "home")).toBe(1)
    expect([...memory.audio.keys()]).toEqual(["p1:t1"])
    expect(await letGoHeldTakes(memory.store, new Set(["t2"]), "home")).toBe(0)
  })

  /**
   * LG1 (HF11): a take leaves only once home holds it and the owner's
   * choice allows it, over every choice (none yet, home, Drive). Under
   * Drive, home holding it never lets it go: the owner's tap does
   * (`studio/__tests__/studio.test.ts`).
   */
  it.each([
    [null, true],
    ["home", false],
    ["drive", true],
  ] as const)(
    "LG1: with the choice %s, the take home holds stays: %s",
    async (choice, stays) => {
      const memory = memoryProjectStore([twoTakes()])
      await letGoHeldTakes(memory.store, new Set(["t1"]), choice)
      const [project] = await memory.store.list()
      // Home holding it is kept either way, so it is not sent again.
      expect(project?.takes[0]).toMatchObject({
        id: "t1",
        keptBy: ["home"],
        onPhone: stays,
      })
      expect(memory.audio.has("p1:t1")).toBe(stays)
      // A take home does not hold stays, whatever the choice.
      expect(project?.takes[1]).toMatchObject({ id: "t2", onPhone: true })
      expect(memory.audio.has("p1:t2")).toBe(true)
    }
  )
})
