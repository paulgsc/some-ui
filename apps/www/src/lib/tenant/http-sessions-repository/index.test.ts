import { describe, expect, it } from "vitest"

import type { FileHostTransport } from "@/lib/file-host-config/client"
import { SessionNotFoundError } from "@/lib/tenant/sessions-repository"
import type { SessionRecord } from "@/lib/tenant/types"

import { createHttpSessionsRepository } from "."

type Call = { route: string; method: string; body: unknown }

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "session-uuid",
    name: "Korean review",
    status: "draft",
    activities: [],
    scenes: [],
    layoutMode: "basic",
    totalDurationMs: 15 * 60_000,
    createdAt: "2026-03-15T09:00:00.000Z",
    updatedAt: "2026-03-15T09:00:00.000Z",
    ...overrides,
  }
}

/** Answers every route with `body`, unless `status` says otherwise. */
function transportOf(
  body: unknown,
  status = 200
): FileHostTransport & { calls: Array<Call> } {
  const calls: Array<Call> = []
  const transport = (route: string, init?: RequestInit): Promise<Response> => {
    calls.push({
      route,
      method: init?.method ?? "GET",
      body:
        init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    })
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    )
  }
  return Object.assign(transport, { calls })
}

const NOT_FOUND = { error: { code: "not_found", message: "not found" } }

describe("HttpSessionsRepository", () => {
  it("lists over GET /sessions", async () => {
    const transport = transportOf([record()])
    const repo = createHttpSessionsRepository(transport)

    expect(await repo.list()).toEqual([record()])
    expect(transport.calls).toEqual([
      { route: "/sessions", method: "GET", body: undefined },
    ])
  })

  it("creates without an id or a totalDurationMs, and takes both from the response", async () => {
    // The whole point of the swap: a client that keeps computing either is
    // a second implementation waiting to disagree, and a stale zero duration
    // produces a notification offering a "~1 min" session.
    const transport = transportOf(record({ totalDurationMs: 20 * 60_000 }))
    const repo = createHttpSessionsRepository(transport)

    const created = await repo.create({
      name: "Korean review",
      activities: [],
      scenes: [],
      layoutMode: "basic",
    })

    expect(created.id).toBe("session-uuid")
    expect(created.totalDurationMs).toBe(20 * 60_000)

    const sent = transport.calls[0]
    expect(sent.method).toBe("POST")
    expect(sent.body).toEqual({
      name: "Korean review",
      activities: [],
      scenes: [],
      layoutMode: "basic",
    })
    expect(sent.body).not.toHaveProperty("id")
    expect(sent.body).not.toHaveProperty("totalDurationMs")
  })

  it("returns null from get for an unknown id, the way the local store does", async () => {
    // A 404 here is data, not an outage: `useSession` renders "not found"
    // from a null and an error page from a rejection.
    const repo = createHttpSessionsRepository(transportOf(NOT_FOUND, 404))
    expect(await repo.get("nope")).toBeNull()
  })

  it("maps a 404 to SessionNotFoundError on update and duplicate", async () => {
    const repo = createHttpSessionsRepository(transportOf(NOT_FOUND, 404))

    await expect(
      repo.update("nope", { status: "active" })
    ).rejects.toBeInstanceOf(SessionNotFoundError)
    await expect(repo.duplicate("nope")).rejects.toBeInstanceOf(
      SessionNotFoundError
    )
  })

  it("sends the batch routes the server declared", async () => {
    const transport = transportOf([record()])
    const repo = createHttpSessionsRepository(transport)

    await repo.removeMany(["a", "b"])
    await repo.updateStatusMany(["a"], "scheduled")

    expect(transport.calls).toEqual([
      { route: "/sessions", method: "DELETE", body: { ids: ["a", "b"] } },
      {
        route: "/sessions/status",
        method: "PATCH",
        body: { ids: ["a"], status: "scheduled" },
      },
    ])
  })

  it("does not ask the server to act on an empty batch", async () => {
    const transport = transportOf([])
    const repo = createHttpSessionsRepository(transport)

    await repo.removeMany([])
    expect(await repo.updateStatusMany([], "draft")).toEqual([])

    expect(transport.calls).toHaveLength(0)
  })

  it("escapes an id rather than building a broken path", async () => {
    const transport = transportOf(record())
    const repo = createHttpSessionsRepository(transport)

    await repo.get("a/b")

    expect(transport.calls[0].route).toBe("/sessions/a%2Fb")
  })

  it("lets a real server error through rather than reporting it as not-found", async () => {
    const repo = createHttpSessionsRepository(
      transportOf({ error: { code: "database_error" } }, 500)
    )

    await expect(repo.get("s1")).rejects.toThrow(/500/)
  })
})
