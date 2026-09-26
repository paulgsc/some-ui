import type { StorageLike } from "@topik/lib/topik/adapter/resume-point"
import { describe, expect, it } from "vitest"

import { createSurveyStore, MAX_SURVEYS, SURVEY_STORAGE_KEY } from "."

const memory = (): StorageLike & { map: Map<string, string> } => {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => void map.set(key, value),
  }
}

describe("createSurveyStore", () => {
  it("keeps a report, newest first, with only what was answered", () => {
    let clock = 1
    const store = createSurveyStore(memory(), () => clock++)
    store.add("a", { worthwhile: "yes", stuck: [] })
    store.add("b", {
      difficulty: "too-hard",
      stuck: [{ batchId: 2, probeId: "c2-rude" }],
      becoming: "  following a drama without subtitles  ",
    })
    expect(store.list()).toEqual([
      {
        topikKey: "b",
        at: 2,
        difficulty: "too-hard",
        stuck: [{ batchId: 2, probeId: "c2-rude" }],
        becoming: "following a drama without subtitles",
      },
      { topikKey: "a", at: 1, worthwhile: "yes", stuck: [] },
    ])
  })

  it("does not keep a blank report: that was a skip", () => {
    const storage = memory()
    createSurveyStore(storage).add("a", { stuck: [], becoming: "  " })
    expect(storage.map.has(SURVEY_STORAGE_KEY)).toBe(false)
  })

  it("forgets the oldest past the bound", () => {
    let clock = 0
    const store = createSurveyStore(memory(), () => clock++)
    for (let i = 0; i <= MAX_SURVEYS; i += 1) {
      store.add(`t${i}`, { worthwhile: "yes", stuck: [] })
    }
    const reports = store.list()
    expect(reports).toHaveLength(MAX_SURVEYS)
    expect(reports.at(-1)?.topikKey).toBe("t1")
  })

  it("discards a document it cannot read, and survives storage that throws", () => {
    const storage = memory()
    storage.map.set(SURVEY_STORAGE_KEY, '{"version":9}')
    expect(createSurveyStore(storage).list()).toEqual([])

    const broken: StorageLike = {
      getItem: () => {
        throw new Error("denied")
      },
      setItem: () => {
        throw new Error("quota")
      },
    }
    const store = createSurveyStore(broken)
    expect(() =>
      store.add("a", { enthusiasm: "drained", stuck: [] })
    ).not.toThrow()
    expect(store.list()).toEqual([])
  })
})
