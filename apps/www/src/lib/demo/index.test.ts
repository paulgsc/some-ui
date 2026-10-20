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
const { SAMPLE_SESSION_NAME, viewerSessionFiles } = await import(
  "@/lib/demo/leetype-sample"
)
const { intakeSessionFile } = await import("@some-ui/leetype")

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

describe("viewerSessionFiles", () => {
  it("holds Thread 1's first session, which the phone's own intake reads clean", async () => {
    const store = viewerSessionFiles()
    const [sample] = await store.list()
    expect(sample.name).toBe(SAMPLE_SESSION_NAME)
    const body = await store.read(SAMPLE_SESSION_NAME)
    const intake = intakeSessionFile(`${SAMPLE_SESSION_NAME}.json`, body ?? "")
    expect(intake).toMatchObject({
      ok: true,
      name: SAMPLE_SESSION_NAME,
      file: { title: sample.title, oneLine: sample.oneLine },
      findings: [],
    })
  })

  it("takes no picks: a viewer's samples are all it holds", async () => {
    const store = viewerSessionFiles()
    await expect(
      store.keep(
        { name: "mine", title: "Mine", oneLine: "One.", body: "{}" },
        new Date("2026-10-20T00:00:00.000Z")
      )
    ).rejects.toThrow()
    expect(await store.read("mine")).toBeNull()
  })
})
