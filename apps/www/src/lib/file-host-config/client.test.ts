/**
 * The route-arrival handoff (r1)/#911: `requestJSON`'s bounded-wait
 * guarantee, unit-tested directly against a fake `FileHostTransport` rather
 * than through a whole route/component tree.
 *
 * The deadline lives in `requestJSON`, not in `createFileHostTransport`
 * (see `client.ts`'s header) - a bot review on this PR's own first head
 * caught the earlier version scoping it to just the transport's own
 * `fetch()` call, which left a response whose *body* stalled after headers
 * arrived with no protection at all. These tests exercise `requestJSON`
 * with hand-built transports for exactly that reason: a real `fetch`-backed
 * transport can't easily simulate "headers arrived, body never resolves"
 * without a real streaming body, but a fake transport can just say so
 * directly.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

import { FileHostUnreachableError } from "."
import type { FileHostTransport } from "./client"
import { requestJSON } from "./client"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("requestJSON: bounded wait", () => {
  it("rejects with FileHostUnreachableError once the deadline fires, when the transport call itself never settles", async () => {
    vi.stubEnv("VITE_FILE_HOST_TIMEOUT_MS", "30")
    const hangingTransport: FileHostTransport = () =>
      new Promise<Response>(() => {})

    await expect(
      requestJSON(hangingTransport, "sessions")
    ).rejects.toBeInstanceOf(FileHostUnreachableError)
  })

  it("rejects with FileHostUnreachableError once the deadline fires, when headers arrive promptly but the body never resolves", async () => {
    vi.stubEnv("VITE_FILE_HOST_TIMEOUT_MS", "30")
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a hand-built stand-in for the one method requestJSON actually calls on a successful Response; the real Response has no minimal constructor for a stalled body.
    const stalledBodyResponse = {
      ok: true,
      status: 200,
      json: () => new Promise(() => {}),
    } as Response
    const promptHeadersTransport: FileHostTransport = () =>
      Promise.resolve(stalledBodyResponse)

    await expect(
      requestJSON(promptHeadersTransport, "sessions")
    ).rejects.toBeInstanceOf(FileHostUnreachableError)
  })

  it("does not delay or affect a response that arrives well within the deadline", async () => {
    vi.stubEnv("VITE_FILE_HOST_TIMEOUT_MS", "5000")
    const fastTransport: FileHostTransport = () =>
      Promise.resolve(new Response(JSON.stringify(["ok"]), { status: 200 }))

    await expect(requestJSON(fastTransport, "sessions")).resolves.toEqual([
      "ok",
    ])
  })

  it("honors a shorter configured deadline over the ~10s default", async () => {
    vi.stubEnv("VITE_FILE_HOST_TIMEOUT_MS", "20")
    const hangingTransport: FileHostTransport = () =>
      new Promise<Response>(() => {})

    const started = Date.now()
    await expect(
      requestJSON(hangingTransport, "sessions")
    ).rejects.toBeInstanceOf(FileHostUnreachableError)
    // Generous upper bound - this asserts the short override took effect,
    // not the default ~10s, without pinning an exact millisecond count.
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it("still resolves a real fetch-backed transport promptly (sanity - no regression from the redesign)", async () => {
    vi.stubEnv("VITE_FILE_HOST_TIMEOUT_MS", "5000")
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
    })
    const fetchLikeTransport: FileHostTransport = vi.fn(() =>
      Promise.resolve(response)
    )

    await expect(requestJSON(fetchLikeTransport, "sessions")).resolves.toEqual({
      ok: true,
    })
    expect(fetchLikeTransport).toHaveBeenCalledWith(
      "sessions",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })
})

describe("requestJSON: retryability of a timeout depends on whether the write is idempotent", () => {
  it("marks a timeout on a POST (create/duplicate) as not retryable - the client can't tell 'never sent' from 'server already did it'", async () => {
    vi.stubEnv("VITE_FILE_HOST_TIMEOUT_MS", "30")
    const hangingTransport: FileHostTransport = () =>
      new Promise<Response>(() => {})

    await expect(
      requestJSON(hangingTransport, "sessions", { method: "POST" })
    ).rejects.toMatchObject({ retryable: false })
  })

  it("still marks a timeout on a GET as retryable (no method - list()/get()'s own shape)", async () => {
    vi.stubEnv("VITE_FILE_HOST_TIMEOUT_MS", "30")
    const hangingTransport: FileHostTransport = () =>
      new Promise<Response>(() => {})

    await expect(
      requestJSON(hangingTransport, "sessions")
    ).rejects.toMatchObject({ retryable: true })
  })

  it("still marks a timeout on a PATCH/DELETE as retryable - repeating them converges on the same end state", async () => {
    vi.stubEnv("VITE_FILE_HOST_TIMEOUT_MS", "30")
    const hangingTransport: FileHostTransport = () =>
      new Promise<Response>(() => {})

    await expect(
      requestJSON(hangingTransport, "sessions", { method: "PATCH" })
    ).rejects.toMatchObject({ retryable: true })
    await expect(
      requestJSON(hangingTransport, "sessions", { method: "DELETE" })
    ).rejects.toMatchObject({ retryable: true })
  })

  it("a connection-refused POST (never reached the server) stays retryable, unlike a timed-out one", async () => {
    vi.stubEnv("VITE_FILE_HOST_TIMEOUT_MS", "5000")
    const refusedTransport: FileHostTransport = () =>
      Promise.reject(new TypeError("Failed to fetch"))

    await expect(
      requestJSON(refusedTransport, "sessions", { method: "POST" })
    ).rejects.toMatchObject({ retryable: true })
  })
})
