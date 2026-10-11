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

  it("keeps one set of answers per session, and tells subscribers", () => {
    const listener = vi.fn()
    const unsubscribe = reflections.subscribe(listener)

    reflections.setAnswers("s1", { difficulty: "too-hard" }, 500)
    reflections.setAnswers("s1", { difficulty: "right" }, 900)

    const kept = reflections.getSnapshot().kept
    expect(kept).toHaveLength(1)
    expect(kept[0]).toMatchObject({
      sessionId: "s1",
      atMs: 900,
      body: { kind: "answers", answers: { difficulty: "right" } },
    })
    expect(listener).toHaveBeenCalledTimes(2)

    reflections.setAnswers("s1", {}, null)
    expect(reflections.getSnapshot().kept).toEqual([])
    unsubscribe()
  })

  it("says failed when the device does not store it", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new DOMException("full", "QuotaExceededError")
    })
    expect(reflections.keep(line("a"))).toBe("failed")
    vi.restoreAllMocks()
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

  it("remembers which sessions were shared", () => {
    reflections.markShared(["s1", "s1", "s2"], new Date("2026-10-10T21:42:00Z"))
    expect(reflections.getSnapshot().shared).toEqual([
      { sessionId: "s2", sharedAt: "2026-10-10T21:42:00.000Z" },
      { sessionId: "s1", sharedAt: "2026-10-10T21:42:00.000Z" },
    ])
  })
})
