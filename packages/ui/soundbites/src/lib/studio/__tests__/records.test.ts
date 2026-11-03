/** @vitest-environment node */
import type { Player } from "@some-ui/voice-capture"
import { run, started, take } from "@soundbites/lib/project/__tests__/fixture"
import { letGoDeletedTakes, letGoHeldTakes } from "@soundbites/lib/project/home"
import { memoryProjectStore } from "@soundbites/lib/project/memory-store"
import type { Project } from "@soundbites/lib/project/model"
import {
  createStudioRecords,
  recordsView,
} from "@soundbites/lib/studio/records"
import { describe, expect, it, vi } from "vitest"

/** Project p1 with takes t1 (shot a) then t2 (shot b), both on the phone. */
function twoTakes(): Project {
  return run(
    started(),
    { type: "takeStarted", shot: "a" },
    take("t1", "a"),
    { type: "takeStarted", shot: "b" },
    take("t2", "b")
  ).project
}

describe("what Studio keeps (MD4)", () => {
  it("lists every take, and offers Delete… only on one home marks deletable and hasn't deleted", async () => {
    const memory = memoryProjectStore([twoTakes()])
    await letGoHeldTakes(memory.store, new Set(["t1", "t2"]), null)
    const [held] = await memory.store.list()
    if (held === undefined) throw new Error("no project")
    const [project] = recordsView([held], new Set(["t1"]), null)
    // Both were recorded at the fixture's one time, so they keep their order.
    expect(project?.rows.map((row) => [row.take.id, row.canDelete])).toEqual([
      ["t1", true],
      ["t2", false],
    ])
    expect(project?.rows[0]?.take.kept).toEqual({ place: "home", since: null })

    const deleted = "2026-11-03T09:00:00.000Z"
    await letGoDeletedTakes(memory.store, new Set(["t1"]), deleted)
    const [after] = await memory.store.list()
    if (after === undefined) throw new Error("no project")
    const row = recordsView([after], new Set(["t1"]), null)[0]?.rows[0]
    expect(row).toMatchObject({ canDelete: false, canPlay: false })
    expect(row?.take.deleted).toBe(deleted)
  })

  it("asks home what it marks deletable one ask at a time, and once more for the writes meanwhile", async () => {
    const memory = memoryProjectStore([twoTakes()])
    const answers: Array<(deletable: ReadonlySet<string>) => void> = []
    const deletable = vi.fn(
      () =>
        new Promise<ReadonlySet<string>>((resolve) => {
          answers.push(resolve)
        })
    )
    const records = createStudioRecords({
      store: memory.store,
      deletable,
      player: { play: vi.fn() },
    })
    const detach = records.attach()
    await letGoHeldTakes(memory.store, new Set(["t1"]), null)
    await letGoHeldTakes(memory.store, new Set(["t2"]), null)
    expect(deletable).toHaveBeenCalledTimes(1)
    answers[0]?.(new Set(["t1"]))
    await vi.waitFor(() => expect(deletable).toHaveBeenCalledTimes(2))
    answers[1]?.(new Set(["t1", "t2"]))
    await vi.waitFor(() =>
      expect(records.getSnapshot().deletable).toEqual(new Set(["t1", "t2"]))
    )
    detach()
  })

  it("plays one take at a time, and a late audio read for an earlier one plays nothing", async () => {
    const memory = memoryProjectStore([twoTakes()])
    const played: Array<Blob> = []
    const player: Player = {
      play: (audio) => {
        played.push(audio)
        return { stop: vi.fn(), ended: new Promise(() => undefined) }
      },
    }
    const records = createStudioRecords({
      store: memory.store,
      deletable: () => Promise.resolve(new Set()),
      player,
    })
    const detach = records.attach()
    await vi.waitFor(() =>
      expect(records.getSnapshot().projects).not.toBeNull()
    )
    records.play("p1", "t1")
    records.play("p1", "t2")
    await vi.waitFor(() => expect(played).toHaveLength(1))
    expect(records.getSnapshot().playing).toBe("t2")
    records.play("p1", "t2")
    expect(records.getSnapshot().playing).toBeNull()
    detach()
  })
})
