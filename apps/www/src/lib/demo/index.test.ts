/**
 * @vitest-environment jsdom
 *
 * A viewer's sample (CLAUDE.md, "two mandates"): drafts the composer could
 * have made, in a store of their own that nothing persists.
 */

import { sequenceScenes } from "@some-ui/activity-catalog"
import { afterEach, describe, expect, it, vi } from "vitest"

const viewer = vi.hoisted(() => ({ build: true }))

vi.mock("@/lib/data-mode", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  get VIEWER_BUILD(): boolean {
    return viewer.build
  },
}))

const { demoSessions, seedDemo } = await import("@/lib/demo")
const { OFFERED_ACTIVITIES } = await import("@/lib/playable")
const { STORAGE_KEY } = await import("@/lib/tenant/sessions-repository")
const { readJSON, tenantStorage } = await import("@/lib/tenant/storage")

afterEach(() => {
  tenantStorage.removeItem(STORAGE_KEY)
  viewer.build = true
})

describe("demoSessions", () => {
  it("drafts one session per offered activity, and one running the first two", () => {
    const sessions = demoSessions()
    expect(sessions).toHaveLength(OFFERED_ACTIVITIES.length + 1)
    for (const session of sessions) {
      expect(session.status).toBe("draft")
      expect(session.scenes).toEqual(sequenceScenes(session.activities))
      expect(session.totalDurationMs).toBeGreaterThan(0)
    }
    expect(sessions.at(-1)?.activities.map((a) => a.activityId)).toEqual(
      OFFERED_ACTIVITIES.slice(0, 2).map((activity) => activity.id)
    )
  })
})

describe("seedDemo", () => {
  it("seeds a viewer's store, which is not the browser's", () => {
    seedDemo()
    expect(readJSON(tenantStorage, STORAGE_KEY, [])).toEqual(demoSessions())
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("leaves the owner's store alone", () => {
    viewer.build = false
    seedDemo()
    expect(readJSON(tenantStorage, STORAGE_KEY, [])).toEqual([])
  })
})
