import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { describe, expect, it } from "vitest"

import { createHunchOutbox } from "@/lib/shop-home/outbox"

const AT = new Date("2026-11-27T05:00:00.000Z")

describe("the shop's hunches home didn't answer", () => {
  it("keeps each hunch once, oldest first, until home answers it", () => {
    const storage = memoryStorage()
    const outbox = createHunchOutbox({ storage: () => storage, now: () => AT })
    let told = 0
    outbox.subscribe(() => {
      told += 1
    })
    outbox.keep("I need a plumber", "r-1")
    outbox.keep("I need a plumber", "r-1")
    outbox.keep("where's my phone", "r-2")
    expect(outbox.kept()).toEqual([
      { hunch: "r-1", words: "I need a plumber", at: AT.toISOString() },
      { hunch: "r-2", words: "where's my phone", at: AT.toISOString() },
    ])
    outbox.answered(new Set(["r-1"]), new Set())
    expect(outbox.kept().map((h) => h.hunch)).toEqual(["r-2"])
    expect(told).toBe(3)
  })

  it("sets a refused hunch aside: kept, and not sent again", () => {
    const storage = memoryStorage()
    const outbox = createHunchOutbox({ storage: () => storage, now: () => AT })
    expect(outbox.keep("I need a plumber", "r-1")).toBe(true)
    outbox.answered(new Set(), new Set(["r-1"]))
    expect(outbox.kept()).toEqual([
      {
        hunch: "r-1",
        words: "I need a plumber",
        at: AT.toISOString(),
        refused: true,
      },
    ])
    expect(outbox.going()).toEqual([])
  })

  it("keeps what it holds across a reload", () => {
    const storage = memoryStorage()
    createHunchOutbox({ storage: () => storage, now: () => AT }).keep(
      "I need a plumber",
      "r-1"
    )
    const reopened = createHunchOutbox({
      storage: () => storage,
      now: () => AT,
    })
    expect(reopened.kept()).toHaveLength(1)
  })
})
