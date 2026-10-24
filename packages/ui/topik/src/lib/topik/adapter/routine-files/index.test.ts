import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import {
  createOpenedStore,
  createRoutineFeed,
  parseRoutineFiles,
  ROUTINE_OPENED_KEY,
} from "@topik/lib/topik/adapter/routine-files"
import { describe, expect, it } from "vitest"

const scene = {
  schema: "some-ui.routine-scene/1",
  answers: "2026-10-13_morning_session-",
  title: "TOPIK 2 · 일상 · 약속",
  decks: [{ id: "a" }, { id: "b" }],
}
const drama = {
  schema: "some-ui.routine-drama/1",
  answers: "drama-20261013T145200123Z",
  tree: { id: "t" },
}

describe("parseRoutineFiles", () => {
  it("reads home's word sets and dramas, newest first as home sent them", () => {
    expect(
      parseRoutineFiles({
        files: [
          { folder: "drama", name: "drama-2.json", file: drama },
          { folder: "scene", name: "scene-1.json", file: scene },
        ],
      })
    ).toEqual([
      { kind: "drama", name: "drama-2.json", tree: { id: "t" } },
      {
        kind: "scene",
        name: "scene-1.json",
        title: "TOPIK 2 · 일상 · 약속",
        decks: [{ id: "a" }, { id: "b" }],
      },
    ])
  })

  it("leaves out a file of a shape it does not know, and reads no answer as none", () => {
    expect(
      parseRoutineFiles({
        files: [
          { folder: "scene", name: "s.json", file: { ...scene, decks: [] } },
          { folder: "scene", name: "t.json", file: drama },
          { folder: "brief", name: "digest.json", file: scene },
          { folder: "drama", name: "d.json", file: drama },
        ],
      }).map((file) => file.name)
    ).toEqual(["d.json"])
    expect(parseRoutineFiles("<html>")).toEqual([])
    expect(parseRoutineFiles({ files: "no" })).toEqual([])
  })

  it("parses what the port hands back", async () => {
    const feed = createRoutineFeed({
      list: () =>
        Promise.resolve({
          files: [{ folder: "drama", name: "d.json", file: drama }],
        }),
    })
    await expect(feed.list()).resolves.toHaveLength(1)
  })
})

describe("createOpenedStore", () => {
  it("keeps the names opened, across stores on the same device", () => {
    const storage = memoryStorage()
    const first = createOpenedStore(storage)
    first.markOpened("a.json")
    first.markOpened("a.json")
    expect([...first.opened()]).toEqual(["a.json"])
    expect([...createOpenedStore(storage).opened()]).toEqual(["a.json"])
  })

  it("reads a record it cannot parse as none opened", () => {
    const storage = memoryStorage()
    storage.setItem(ROUTINE_OPENED_KEY, "{not json")
    expect(createOpenedStore(storage).opened().size).toBe(0)
  })
})
