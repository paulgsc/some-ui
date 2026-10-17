/**
 * @vitest-environment jsdom
 *
 * A viewer's sample (CLAUDE.md, "A viewer tries, and nothing is kept"):
 * drafts the composer could have made, in a page storage of their own.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

const viewer = vi.hoisted(() => ({ build: true }))

vi.mock("@/lib/data-mode", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  get VIEWER_BUILD(): boolean {
    return viewer.build
  },
}))

const browserStorage = window.localStorage
const { demoSessions, seedDemo } = await import("@/lib/demo")
const { OFFERED_ACTIVITIES } = await import("@/lib/playable")
const { STORAGE_KEY } = await import("@/lib/tenant/sessions-repository")

afterEach(() => {
  window.localStorage.clear()
  viewer.build = true
})

describe("demoSessions", () => {
  it("drafts one session per offered activity, and one running the first two", () => {
    const sessions = demoSessions()
    expect(sessions).toHaveLength(OFFERED_ACTIVITIES.length + 1)
    for (const session of sessions) {
      expect(session.status).toBe("draft")
      expect(session.scenes).toHaveLength(session.activities.length)
      expect(session.totalDurationMs).toBeGreaterThan(0)
    }
    expect(sessions.at(-1)?.activities.map((a) => a.activityId)).toEqual(
      OFFERED_ACTIVITIES.slice(0, 2).map((activity) => activity.id)
    )
  })
})

describe("the viewer's storage", () => {
  it("is a copy of the page's own once installed, so nothing reaches the browser", async () => {
    await import("@/lib/demo/viewer-storage")
    expect(window.localStorage).not.toBe(browserStorage)
    expect(window.sessionStorage.getItem("anything")).toBeNull()

    seedDemo()

    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]")
    ).toEqual(demoSessions())
    expect(browserStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("is not seeded on the owner's builds", () => {
    viewer.build = false
    seedDemo()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
