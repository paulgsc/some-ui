/**
 * The presence lease writer's only entry point: does it post the right
 * shape, in the right mode, and swallow every way it can fail?
 */
import { describe, expect, it } from "vitest"

import type { FileHostTransport } from "@/lib/file-host-config/client"

import { reportPresence } from "./presence"

function transport(): FileHostTransport & {
  calls: Array<{ route: string; body: BodyInit | null | undefined }>
} {
  const calls: Array<{ route: string; body: BodyInit | null | undefined }> = []
  const fn = (route: string, init?: RequestInit): Promise<Response> => {
    calls.push({ route, body: init?.body })
    return Promise.resolve(
      new Response(
        JSON.stringify({
          context_key: "session-1",
          observed_at: "2026-08-26T00:00:00Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )
  }
  return Object.assign(fn, { calls })
}

describe("reportPresence", () => {
  it("posts the context key to /presence/lease in server mode", async () => {
    const t = transport()

    const sent = await reportPresence("session-1", {
      transport: t,
      mode: "server",
    })

    expect(sent).toBe(true)
    expect(t.calls).toEqual([
      {
        route: "/presence/lease",
        body: JSON.stringify({ context_key: "session-1" }),
      },
    ])
  })

  it("sends nothing on the static build, which has no presence ledger", async () => {
    const t = transport()

    expect(
      await reportPresence("session-1", { transport: t, mode: "static" })
    ).toBe(false)
    expect(t.calls).toEqual([])
  })

  it("writes nothing for an empty context key rather than inventing one", async () => {
    const t = transport()

    expect(await reportPresence("", { transport: t, mode: "server" })).toBe(
      false
    )
    expect(t.calls).toEqual([])
  })

  it("swallows an unreachable backend rather than throwing", async () => {
    const dead: FileHostTransport = () =>
      Promise.reject(new Error("Failed to fetch"))

    await expect(
      reportPresence("session-1", { transport: dead, mode: "server" })
    ).resolves.toBe(false)
  })

  it("swallows a 422 from an unexpected empty context key", async () => {
    const rejecting: FileHostTransport = () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { code: "invalid" } }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        })
      )

    await expect(
      reportPresence("session-1", { transport: rejecting, mode: "server" })
    ).resolves.toBe(false)
  })
})
