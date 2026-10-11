/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Reflection } from "@/lib/session-reflection"
import { REFLECTION_LIMIT, reflections } from "@/lib/session-reflection"

function line(id: string, sessionId = "s1"): Reflection {
  return {
    id,
    sessionId,
    createdAt: "2026-10-11T12:00:00.000Z",
    atMs: 1000,
    body: { kind: "text", text: `line ${id}` },
  }
}

beforeEach(() => {
  localStorage.clear()
  reflections.letGo(reflections.getSnapshot().kept.map((r) => r.id))
})

describe("reflections", () => {
  it("keeps up to the limit across sessions, then refuses until some go", () => {
    for (let i = 0; i < REFLECTION_LIMIT; i++)
      expect(reflections.keep(line(`r${i}`, `s${i % 3}`))).toBe("kept")

    expect(reflections.keep(line("over"))).toBe("full")
    expect(reflections.getSnapshot().kept).toHaveLength(REFLECTION_LIMIT)

    reflections.letGo(["r0"])
    expect(reflections.keep(line("over"))).toBe("kept")
  })

  it("tells subscribers of each write, and reads it afresh", () => {
    const listener = vi.fn()
    const unsubscribe = reflections.subscribe(listener)

    reflections.setAnswers("s1", { difficulty: "too-hard" }, 500)
    reflections.keep(line("a"))

    expect(listener).toHaveBeenCalledTimes(2)
    expect(reflections.getSnapshot().kept).toHaveLength(2)
    unsubscribe()
  })

  it("says failed when the device does not store a new one, a change or a removal", () => {
    reflections.setAnswers("s1", { difficulty: "too-hard" }, null)
    const ids = reflections.getSnapshot().kept.map((r) => r.id)
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError")
    })
    expect(reflections.keep(line("a"))).toBe("failed")
    expect(reflections.setAnswers("s1", { difficulty: "right" }, null)).toBe(
      "failed"
    )
    expect(reflections.setAnswers("s1", {}, null)).toBe("failed")
    expect(reflections.letGo(ids)).toBe(false)
    vi.restoreAllMocks()
    expect(reflections.getSnapshot().kept).toMatchObject([
      { body: { answers: { difficulty: "too-hard" } } },
    ])
  })

  it("moves the old answers list over once, as stale answers", () => {
    localStorage.setItem(
      "some-ui:session-reflections",
      JSON.stringify([{ id: "s9", answers: { worthwhile: "no" } }])
    )
    reflections.letGo([])

    expect(reflections.getSnapshot().kept).toMatchObject([
      { id: "legacy-s9", sessionId: "s9", body: { kind: "answers" } },
    ])
    expect(localStorage.getItem("some-ui:session-reflections")).toBeNull()
  })

  it("keeps the old answers list when moving it over could not be stored", () => {
    localStorage.setItem(
      "some-ui:session-reflections",
      JSON.stringify([{ id: "s8", answers: { worthwhile: "yes" } }])
    )
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError")
    })
    reflections.letGo([])

    expect(reflections.getSnapshot().kept).toEqual([])
    expect(localStorage.getItem("some-ui:session-reflections")).not.toBeNull()
    vi.restoreAllMocks()
  })

  it("remembers which sessions were shared", () => {
    reflections.markShared(["s1", "s1", "s2"], new Date("2026-10-10T21:42:00Z"))
    expect(reflections.getSnapshot().shared).toEqual([
      { sessionId: "s2", sharedAt: "2026-10-10T21:42:00.000Z" },
      { sessionId: "s1", sharedAt: "2026-10-10T21:42:00.000Z" },
    ])
  })
})
