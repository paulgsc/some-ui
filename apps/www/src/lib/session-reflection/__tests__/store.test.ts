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
  it("never refuses one for room, and drops none past the offline set (LA16)", () => {
    const many = REFLECTION_LIMIT * 3
    for (let i = 0; i < many; i++)
      expect(reflections.keep(line(`r${i}`, `s${i % 3}`))).toBe("kept")
    expect(reflections.getSnapshot().kept).toHaveLength(many)
  })

  it("lets go only the ones past the offline set that home holds", () => {
    for (let i = 0; i < REFLECTION_LIMIT + 2; i++) {
      const at = new Date(Date.UTC(2026, 9, 11, 12, i)).toISOString()
      reflections.keep({ ...line(`r${i}`), createdAt: at })
    }
    // r0 and r1 are the two oldest, past the newest twenty; home holds r0
    // and the newest, r21.
    reflections.trimOffline(new Set(["r0", "r21"]))
    const ids = reflections.getSnapshot().kept.map((r) => r.id)
    expect(ids).toHaveLength(REFLECTION_LIMIT + 1)
    expect(ids).not.toContain("r0")
    expect(ids).toContain("r1")
    expect(ids).toContain("r21")
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
