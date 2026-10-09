import { workedLesson } from "@topik/lib/topik/generation/tree-intake/worked-example"
import { describe, expect, it } from "vitest"

import {
  createServedPointStore,
  createTreeFeed,
  SERVED_DRAMA_POINT_KEY,
} from "."

const ENTRY = {
  key: "first-tea",
  displayName: "First tea",
  description: "",
  batchCount: 1,
  totalQuestions: 3,
  totalMessages: 12,
  tags: ["topik-2"],
}

describe("createTreeFeed", () => {
  it("lists the served trees' manifest entries", async () => {
    const feed = createTreeFeed(
      () => Promise.resolve({ version: "v", topiks: [ENTRY] }),
      () => Promise.reject(new Error("not loaded"))
    )
    await expect(feed.list()).resolves.toEqual([ENTRY])
  })

  it("loads a served tree through both audits (MK4)", async () => {
    // The body as the lesson route serves it, parsed.
    const served: unknown = JSON.parse(JSON.stringify(workedLesson()))
    const feed = createTreeFeed(
      () => Promise.resolve({ version: "v", topiks: [] }),
      (key) =>
        key === "first-tea"
          ? Promise.resolve(served)
          : Promise.reject(new Error(key))
    )
    await expect(feed.load("first-tea")).resolves.toMatchObject({
      status: "checked",
      lesson: workedLesson(),
    })
  })

  it("does not play a served tree the audits reject", async () => {
    const edited: unknown = JSON.parse(
      JSON.stringify(workedLesson()).replace(
        '"feeling":"tension"',
        '"feeling":"ennui"'
      )
    )
    const feed = createTreeFeed(
      () => Promise.resolve({ version: "v", topiks: [] }),
      () => Promise.resolve(edited)
    )
    await expect(feed.load("first-tea")).resolves.toMatchObject({
      status: "rejected",
    })
  })
})

describe("createServedPointStore", () => {
  const memory = (): Pick<Storage, "getItem" | "setItem"> => {
    const data = new Map<string, string>()
    return {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value),
    }
  }

  it("keeps the place of the tree played last, by its id", () => {
    const storage = memory()
    const points = createServedPointStore(storage)
    points.set("first-tea", { route: ["b"] })
    expect(createServedPointStore(storage).get("first-tea")).toEqual({
      route: ["b"],
    })
    // Another tree starts from its opening, and takes the slot.
    expect(points.get("second-tea")).toBeUndefined()
    points.set("second-tea", { route: [] })
    expect(points.get("first-tea")).toBeUndefined()
  })

  it("reads nothing from a slot it cannot parse, and survives storage refusing", () => {
    const storage = memory()
    storage.setItem(SERVED_DRAMA_POINT_KEY, "{")
    expect(createServedPointStore(storage).get("first-tea")).toBeUndefined()
    const refusing = {
      getItem: (): string | null => {
        throw new Error("SecurityError")
      },
      setItem: (): void => {
        throw new Error("QuotaExceededError")
      },
    }
    const points = createServedPointStore(refusing)
    expect(() => points.set("first-tea", {})).not.toThrow()
    expect(points.get("first-tea")).toBeUndefined()
  })
})
