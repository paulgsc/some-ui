import type { StorageLike } from "@topik/lib/topik/adapter/resume-point"
import { describe, expect, it } from "vitest"

import {
  createSurveyStore,
  MAX_SURVEYS,
  SURVEY_STORAGE_KEY,
  SURVEY_TTL_MS,
} from "."

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

  it("never reads a report past its expiry, even with nothing written since (canon Rem. 7.4)", () => {
    const storage = memory()
    let clock = 1_000
    createSurveyStore(storage, () => clock).add("old", {
      worthwhile: "no",
      stuck: [],
    })
    clock += SURVEY_TTL_MS - 1
    expect(createSurveyStore(storage, () => clock).list()).toHaveLength(1)
    clock += 2
    expect(createSurveyStore(storage, () => clock).list()).toEqual([])
  })

  it("records the lesson's level and name with the report", () => {
    const store = createSurveyStore(memory(), () => 5)
    store.add(
      "k",
      { difficulty: "right", stuck: [] },
      { displayName: "Dinner", level: 2 }
    )
    expect(store.list()[0]).toMatchObject({ displayName: "Dinner", level: 2 })
  })

  it("forgets the free text of the reports a prompt carried, and only theirs", () => {
    let clock = 1
    const store = createSurveyStore(memory(), () => clock++)
    store.add("a", { stuck: [], becoming: "older" })
    store.add("b", { stuck: [], becoming: "newer" })
    store.forgetBecoming(1)
    const [newest, older] = store.list()
    expect(newest?.becoming).toBeUndefined()
    // A report left with nothing else in it is still the learner's verdict
    // that the lesson happened; it stays.
    expect(newest?.topikKey).toBe("b")
    expect(older?.becoming).toBe("older")
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
