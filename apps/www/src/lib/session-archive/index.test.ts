/**
 * The archive of finished sessions: what goes out (finished before today,
 * whole records) and what leaves the phone once the person says it arrived
 * (only those unchanged since).
 */
import { sessionRecord } from "@/test-support/session-record"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { letGoUnchanged, shareArchive } from "@/lib/session-archive"
import type { SessionRecord } from "@/lib/tenant/types"

type Shared = {
  dir: string
  files: ReadonlyArray<{ name: string; data: string }>
}

const phone = vi.hoisted(
  (): { sessions: Array<SessionRecord>; shared: Array<Shared> } => ({
    sessions: [],
    shared: [],
  })
)

vi.mock("@/lib/share-files", () => ({
  shareFiles: (
    dir: string,
    _title: string,
    files: ReadonlyArray<{ name: string; data: string }>
  ): Promise<{ status: "succeeded"; value: "shared" }> => {
    phone.shared.push({ dir, files })
    return Promise.resolve({ status: "succeeded", value: "shared" })
  },
}))
vi.mock("@/lib/tenant/queries", () => ({
  sessionsRepository: {
    list: (): Promise<Array<SessionRecord>> =>
      Promise.resolve([...phone.sessions]),
    removeMany: (ids: ReadonlyArray<string>): Promise<void> => {
      phone.sessions = phone.sessions.filter((s) => !ids.includes(s.id))
      return Promise.resolve()
    },
  },
}))
vi.mock("@/lib/device-backend/storage-view", () => ({
  deviceStorage: { refresh: (): Promise<void> => Promise.resolve() },
}))

const NOW = new Date("2026-10-15T10:00:00Z")

beforeEach(() => {
  phone.shared = []
  phone.sessions = [
    sessionRecord({
      id: "old",
      name: "Morning drama",
      status: "completed",
      completedAt: "2026-10-10T09:00:00.000Z",
      updatedAt: "2026-10-10T09:00:00.000Z",
    }),
    sessionRecord({
      id: "today",
      status: "completed",
      completedAt: new Date(NOW.getTime() - 60_000).toISOString(),
    }),
    sessionRecord({ id: "open", status: "paused" }),
  ]
})

describe("archiving finished sessions", () => {
  it("shares the whole records of sessions finished before today, as one file", async () => {
    const result = await shareArchive(() => NOW)
    expect(result).toEqual({
      outcome: "shared",
      sent: [{ id: "old", updatedAt: "2026-10-10T09:00:00.000Z" }],
    })
    expect(phone.shared).toHaveLength(1)
    const [{ dir, files }] = phone.shared
    expect(dir).toBe("session-archive")
    expect(files.map((f) => f.name)).toEqual([
      expect.stringMatching(/^sessions-2026-10-1[45]\.json$/),
    ])
    expect(JSON.parse(files[0].data)).toMatchObject({
      sessions: [phone.sessions[0]],
    })
  })

  it("lets go only of what went out and is unchanged since", async () => {
    const { sent } = await shareArchive(() => NOW)
    phone.sessions = phone.sessions.map((s) =>
      s.id === "old" ? s : { ...s, updatedAt: "2026-10-15T11:00:00.000Z" }
    )
    expect(await letGoUnchanged(sent)).toBe(1)
    expect(phone.sessions.map((s) => s.id)).toEqual(["today", "open"])

    // Changed after it went out: the archive no longer holds it as it is.
    phone.sessions = [
      { ...phone.sessions[0], id: "old", updatedAt: "2026-10-15T12:00:00Z" },
    ]
    expect(await letGoUnchanged(sent)).toBe(0)
    expect(phone.sessions).toHaveLength(1)
  })

  it("shares nothing when nothing is finished before today", async () => {
    phone.sessions = phone.sessions.filter((s) => s.id !== "old")
    expect(await shareArchive(() => NOW)).toEqual({
      outcome: "cancelled",
      sent: [],
    })
    expect(phone.shared).toEqual([])
  })
})
