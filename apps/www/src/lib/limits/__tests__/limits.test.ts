/**
 * The limits' reads: each row counted from its own read, a failed read said
 * on its row and reported, and a read a newer refresh overtook dropped.
 */
import { addFailureSink } from "@some-ui/intent-kit"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { LimitCount, LimitRow } from "@/lib/limits"
import { createLimits, LIMIT_ROWS, standingOf } from "@/lib/limits"
import { LIMITS_WORDS, PHONE_LIMITS } from "@/lib/limits/words"

const row = (
  id: string,
  read: () => Promise<LimitCount>,
  concern: LimitRow["concern"] = "phone"
): LimitRow => ({
  id,
  concern,
  words: PHONE_LIMITS.wordSets,
  unit: "count",
  sources: [],
  read,
})

const removers: Array<() => void> = []
afterEach(() => {
  for (const remove of removers.splice(0)) remove()
})

describe("createLimits", () => {
  it("counts each of a concern's rows, and leaves the others unread", async () => {
    const limits = createLimits([
      row("a", () => Promise.resolve({ kept: 3, limit: 50 })),
      row("b", () => Promise.resolve({ kept: 1, limit: 7 }), "home"),
    ])
    await limits.refresh("phone")
    expect(limits.getSnapshot()).toEqual({
      a: { kind: "counted", count: { kept: 3, limit: 50 } },
    })
  })

  it("says counting until the read lands, and tells its listeners", async () => {
    let land: (count: LimitCount) => void = () => undefined
    const limits = createLimits([
      row("a", () => new Promise((resolve) => (land = resolve))),
    ])
    const listener = vi.fn()
    limits.subscribe(listener)
    const refreshed = limits.refresh("phone")
    expect(limits.getSnapshot()["a"]).toEqual({ kind: "counting" })
    land({ kept: 1, limit: 2 })
    await refreshed
    expect(limits.getSnapshot()["a"]?.kind).toBe("counted")
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("says a failed read on its row, reports it, and counts the rest", async () => {
    const failures = vi.fn()
    removers.push(addFailureSink(failures))
    const limits = createLimits([
      row("a", () => Promise.reject(new Error("gone"))),
      row("b", () => Promise.resolve({ kept: 0, limit: 5 })),
    ])
    await limits.refresh("phone")
    expect(limits.getSnapshot()["a"]).toEqual({ kind: "unread" })
    expect(limits.getSnapshot()["b"]?.kind).toBe("counted")
    expect(failures).toHaveBeenCalledWith(
      expect.objectContaining({ port: "limits (a)" })
    )
  })

  it("drops a read that a newer refresh overtook", async () => {
    const lands: Array<(count: LimitCount) => void> = []
    const limits = createLimits([
      row("a", () => new Promise((resolve) => lands.push(resolve))),
    ])
    const older = limits.refresh("phone")
    const newer = limits.refresh("phone")
    lands[1]?.({ kept: 2, limit: 9 })
    await newer
    lands[0]?.({ kept: 1, limit: 9 })
    await older
    expect(limits.getSnapshot()["a"]).toEqual({
      kind: "counted",
      count: { kept: 2, limit: 9 },
    })
  })
})

describe("standingOf", () => {
  const unit = (id: string): Pick<LimitRow, "words" | "unit"> => {
    const found = LIMIT_ROWS.find((each) => each.id === id)
    if (found === undefined) throw new Error(id)
    return found
  }

  it("says a count, a size and days in the person's units", () => {
    expect(standingOf(unit("wordSets"), { kept: 12, limit: 50 })).toBe(
      "12 of 50 kept"
    )
    expect(
      standingOf(unit("storage"), {
        kept: 1024 * 1024,
        limit: 25 * 1024 * 1024,
      })
    ).toMatch(/^Using 1(\.0)? MB of 25(\.0)? MB$/)
    expect(standingOf(unit("lastDrama"), { kept: 3, limit: 30 })).toBe(
      "Played 3 days ago, kept for 30 days"
    )
    expect(standingOf(unit("lastDrama"), { kept: 0, limit: 30 })).toBe(
      `Played ${LIMITS_WORDS.underADay} ago, kept for 30 days`
    )
  })

  it("says nothing kept where a limit has no count of its own", () => {
    expect(standingOf(unit("lastDrama"), { kept: null, limit: 30 })).toBe(
      PHONE_LIMITS.lastDrama.nothing("30 days")
    )
    expect(standingOf(unit("stops"), { kept: null, limit: 20 })).toBe(
      "0 of 20 kept"
    )
  })
})
