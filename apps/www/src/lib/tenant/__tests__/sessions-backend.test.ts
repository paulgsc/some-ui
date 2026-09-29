/**
 * @vitest-environment jsdom
 *
 * `createSessionsBackend` in server mode: the one-time upload of this
 * browser's local sessions goes to per-person routes, so it must wait for a
 * session. Started while signed out it would meet a 401, spend its one turn,
 * and leave the new account empty until a reload.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

import { createSessionsBackend } from "@/lib/tenant/sessions-backend"
import { STORAGE_KEY } from "@/lib/tenant/sessions-repository"
import { createInMemoryStorage, writeJSON } from "@/lib/tenant/storage"
import type { SessionRecord } from "@/lib/tenant/types"

const legacy: SessionRecord = {
  id: "local-1",
  name: "Korean review",
  status: "scheduled",
  activities: [],
  scenes: [],
  layoutMode: "basic",
  totalDurationMs: 10 * 60_000,
  createdAt: "2026-03-14T09:00:00.000Z",
  updatedAt: "2026-03-14T09:00:00.000Z",
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("createSessionsBackend: the local-sessions migration", () => {
  it("waits for a session, then runs on the first call made with one", async () => {
    const requests: Array<string> = []
    let signedIn = false
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET"
        requests.push(`${method} ${new URL(url).pathname}`)
        if (!signedIn) {
          return Promise.resolve(
            Response.json(
              { error: { code: "unauthorized", message: "no session" } },
              { status: 401 }
            )
          )
        }
        return Promise.resolve(
          Response.json(method === "POST" ? { ...legacy, id: "server-1" } : [])
        )
      })
    )
    const storage = createInMemoryStorage()
    writeJSON(storage, STORAGE_KEY, [legacy])
    const store = createSessionsBackend("server", storage, () =>
      Promise.resolve(signedIn)
    )

    await expect(store.list()).rejects.toThrow()
    expect(requests).toEqual(["GET /api/v1/sessions"])

    signedIn = true
    requests.length = 0
    await store.list()
    expect(requests[0]).toBe("POST /api/v1/sessions")
    expect(requests.at(-1)).toBe("GET /api/v1/sessions")
  })
})
