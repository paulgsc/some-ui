/**
 * The route-arrival handoff (r1)/#911: `createFileHostTransport`'s own
 * bounded-wait guarantee, unit-tested directly against the transport rather
 * than through a whole route/component tree.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

import { FileHostUnreachableError } from "."
import { createFileHostTransport } from "./client"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("createFileHostTransport: bounded wait", () => {
  it("rejects with FileHostUnreachableError once the deadline fires, even when fetch itself never settles and ignores the abort signal", async () => {
    vi.stubEnv("VITE_FILE_HOST_TIMEOUT_MS", "30")
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {}))
    )

    const transport = createFileHostTransport({
      baseUrl: "https://file-host.example/api/v1",
      source: "override",
    })
    if (!transport) throw new Error("expected a transport")

    await expect(transport("sessions")).rejects.toBeInstanceOf(
      FileHostUnreachableError
    )
  })

  it("does not delay or affect a response that arrives well within the deadline", async () => {
    vi.stubEnv("VITE_FILE_HOST_TIMEOUT_MS", "5000")
    const response = new Response(JSON.stringify([]), { status: 200 })
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(response))
    )

    const transport = createFileHostTransport({
      baseUrl: "https://file-host.example/api/v1",
      source: "override",
    })
    if (!transport) throw new Error("expected a transport")

    await expect(transport("sessions")).resolves.toBe(response)
  })

  it("honors a shorter configured deadline over the ~10s default", async () => {
    vi.stubEnv("VITE_FILE_HOST_TIMEOUT_MS", "20")
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {}))
    )

    const transport = createFileHostTransport({
      baseUrl: "https://file-host.example/api/v1",
      source: "override",
    })
    if (!transport) throw new Error("expected a transport")

    const started = Date.now()
    await expect(transport("sessions")).rejects.toBeInstanceOf(
      FileHostUnreachableError
    )
    // Generous upper bound - this asserts the short override took effect,
    // not the default ~10s, without pinning an exact millisecond count.
    expect(Date.now() - started).toBeLessThan(2000)
  })
})
