import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import type { StorageLike } from "@topik/lib/topik/adapter/storage"
import type { SurveyReport } from "@topik/lib/topik/core/lesson-survey"
import { describe, expect, it } from "vitest"

import {
  createSurveyStore,
  MAX_SURVEYS,
  SURVEY_STORAGE_KEY,
  SURVEY_TTL_MS,
} from "."

/** Storage holding `reports` as an earlier build wrote them, newest first. */
const holding = (
  reports: Array<SurveyReport>
): ReturnType<typeof memoryStorage> => {
  const storage = memoryStorage()
  storage.map.set(SURVEY_STORAGE_KEY, JSON.stringify({ version: 1, reports }))
  return storage
}

const report = (topikKey: string, at: number, extra = {}): SurveyReport => ({
  topikKey,
  at,
  stuck: [],
  ...extra,
})

describe("createSurveyStore", () => {
  it("lists the kept reports, newest first, as they were written", () => {
    const kept = [
      report("b", 2, {
        difficulty: "too-hard",
        stuck: [{ batchId: 2, probeId: "c2-rude" }],
        becoming: "following a drama without subtitles",
        displayName: "Dinner",
        level: 2,
      }),
      report("a", 1, { worthwhile: "yes" }),
    ]
    expect(createSurveyStore(holding(kept), () => 3).list()).toEqual(kept)
  })

  it("reads no more than the bound", () => {
    const kept = Array.from({ length: MAX_SURVEYS + 1 }, (_, i) =>
      report(`t${i}`, MAX_SURVEYS + 1 - i)
    )
    const reports = createSurveyStore(holding(kept), () => 100).list()
    expect(reports).toHaveLength(MAX_SURVEYS)
    expect(reports.at(-1)?.topikKey).toBe(`t${MAX_SURVEYS - 1}`)
  })

  it("never reads a report past its expiry (canon Rem. 7.4)", () => {
    const storage = holding([report("old", 1_000, { worthwhile: "no" })])
    let clock = 1_000 + SURVEY_TTL_MS - 1
    expect(createSurveyStore(storage, () => clock).list()).toHaveLength(1)
    clock += 2
    expect(createSurveyStore(storage, () => clock).list()).toEqual([])
  })

  it("deletes an expired report from storage on the read that drops it", () => {
    const storage = holding([
      report("new", 1_000 + SURVEY_TTL_MS / 2, { worthwhile: "yes" }),
      report("old", 1_000, { becoming: "reading webtoons raw" }),
    ])
    const store = createSurveyStore(storage, () => 1_000 + SURVEY_TTL_MS + 1)
    expect(store.list().map(({ topikKey }) => topikKey)).toEqual(["new"])
    const kept = storage.getItem(SURVEY_STORAGE_KEY) ?? ""
    expect(kept).not.toContain("reading webtoons raw")
    expect(kept).toContain('"new"')
  })

  it("forgets the free text of the reports a prompt carried, and only theirs", () => {
    const store = createSurveyStore(
      holding([
        report("c", 3, { becoming: "after the prompt" }),
        report("b", 2, { becoming: "newer" }),
        report("a", 1, { becoming: "older" }),
      ]),
      () => 4
    )
    store.forgetBecoming([{ topikKey: "b", at: 2 }])
    const [latest, carried, older] = store.list()
    expect(latest?.becoming).toBe("after the prompt")
    expect(carried?.becoming).toBeUndefined()
    // A report left with nothing else in it is still the learner's verdict
    // that the lesson happened; it stays.
    expect(carried?.topikKey).toBe("b")
    expect(older?.becoming).toBe("older")
  })

  it("discards a document it cannot read, and survives storage that throws", () => {
    const storage = memoryStorage()
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
    expect(() => store.forgetBecoming([{ topikKey: "a", at: 1 }])).not.toThrow()
    expect(store.list()).toEqual([])
  })
})
