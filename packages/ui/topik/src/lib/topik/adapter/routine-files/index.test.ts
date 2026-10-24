import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import {
  createHeldAnswers,
  createOpenedStore,
  createRoutineFeed,
  openedKey,
  parseRoutineFiles,
  ROUTINE_ANSWERS_KEY,
  ROUTINE_OPENED_KEY,
} from "@topik/lib/topik/adapter/routine-files"
import { createRunLog } from "@topik/lib/topik/adapter/routine-runs"
import {
  workedExample,
  workedLesson,
} from "@topik/lib/topik/generation/tree-intake/worked-example"
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
  tree: JSON.parse(workedExample()),
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
      { kind: "drama", name: "drama-2.json", tree: workedLesson() },
      {
        kind: "scene",
        name: "scene-1.json",
        title: "TOPIK 2 · 일상 · 약속",
        decks: [{ id: "a" }, { id: "b" }],
      },
    ])
  })

  it("leaves out a file of a shape it does not know, or a drama the phone could not play, and reads no answer as none", () => {
    const { tree: _tree, ...treeless } = drama
    expect(
      parseRoutineFiles({
        files: [
          { folder: "scene", name: "s.json", file: { ...scene, decks: [] } },
          {
            folder: "scene",
            name: "three.json",
            file: { ...scene, decks: [{}, {}, {}] },
          },
          { folder: "scene", name: "t.json", file: drama },
          { folder: "brief", name: "digest.json", file: scene },
          { folder: "drama", name: "none.json", file: treeless },
          {
            folder: "drama",
            name: "rejected.json",
            file: { ...drama, tree: { id: "t" } },
          },
          { folder: "drama", name: "d.json", file: drama },
        ],
      }).map((file) => file.name)
    ).toEqual(["d.json"])
    expect(parseRoutineFiles("<html>")).toEqual([])
    expect(parseRoutineFiles({ files: "no" })).toEqual([])
  })

  it("parses what the port hands back, and keeps the runs it tells of under the port's key", async () => {
    const runs = createRunLog(memoryStorage())
    const run = {
      schema: "some-ui.routine-run/1",
      startedAt: "2026-10-24T16:02:08Z",
      outcome: "done",
      found: { reflections: 0, prompts: 0 },
      added: [],
    }
    const answer = {
      files: [{ folder: "drama", name: "d.json", file: drama }],
      runs: [{ folder: "run", name: "run-reflections-1.json", file: run }],
      at: "2026-10-24T18:00:00.000Z",
    }
    const held = createHeldAnswers(memoryStorage())
    const feed = createRoutineFeed(
      { key: "home-1", list: () => Promise.resolve(answer) },
      runs,
      held
    )
    await expect(feed.list()).resolves.toHaveLength(1)
    expect(feed.runs).toBe(runs)
    expect(runs.held("home-1")).toMatchObject({
      runs: [{ name: "run-reflections-1.json" }],
      lookedAt: answer.at,
    })
    expect(runs.held("").runs).toEqual([])

    // Away from home the port hands back no dated answer: home's last one
    // for this key is listed, and an older one never replaces it.
    const away = createRoutineFeed(
      { key: "home-1", list: () => Promise.resolve({ files: [] }) },
      runs,
      held
    )
    await expect(away.list()).resolves.toHaveLength(1)
    held.keep("home-1", "2026-10-23T00:00:00.000Z", { files: [] })
    await expect(away.list()).resolves.toHaveLength(1)

    const before = createRoutineFeed(
      { list: () => Promise.resolve({ files: [] }) },
      runs,
      held
    )
    await expect(before.list()).resolves.toEqual([])
    expect(before.key).toBeUndefined()
    expect(runs.held("").lookedAt).toBeNull()
  })

  it("keeps home's answers across copies on one device, and never writes over one it cannot read", () => {
    const storage = memoryStorage()
    createHeldAnswers(storage).keep("a", "2026-10-24T00:00:00.000Z", { n: 1 })
    expect(createHeldAnswers(storage).held("a")).toEqual({ n: 1 })
    expect(createHeldAnswers(storage).held("b")).toBeNull()
    storage.setItem(ROUTINE_ANSWERS_KEY, "{not json")
    const unreadable = createHeldAnswers(storage)
    unreadable.keep("a", "2026-10-25T00:00:00.000Z", { n: 2 })
    expect(unreadable.held("a")).toEqual({ n: 2 })
    expect(storage.getItem(ROUTINE_ANSWERS_KEY)).toBe("{not json")
  })

  it("carries the port's key, which the handheld's list is keyed on", () => {
    const list = (): Promise<unknown> => Promise.resolve({ files: [] })
    expect(createRoutineFeed({ key: "pairing-1@5", list }).key).toBe(
      "pairing-1@5"
    )
  })
})

describe("createOpenedStore", () => {
  it("keys a file by its folder and name, as home does", () => {
    const [played, read] = parseRoutineFiles({
      files: [
        { folder: "drama", name: "same.json", file: drama },
        { folder: "scene", name: "same.json", file: scene },
      ],
    })
    expect([played && openedKey(played), read && openedKey(read)]).toEqual([
      "drama/same.json",
      "scene/same.json",
    ])
  })

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
