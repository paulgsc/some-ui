import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { ApiError, createFetchClient } from "./fetch-client"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain" },
  })
}

function blobResponse(status = 200): Response {
  return new Response(new Blob(["binary"]), {
    status,
    headers: { "content-type": "application/octet-stream" },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("content-type branching", () => {
  it("parses a JSON response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ foo: "bar" }))
    const client = createFetchClient()

    const result = await client.get<{ foo: string }>(
      new URL("https://api.test/data")
    )

    expect(result).toEqual({ foo: "bar" })
  })

  it("parses a text response", async () => {
    fetchMock.mockResolvedValue(textResponse("hello"))
    const client = createFetchClient()

    const result = await client.get<string>(new URL("https://api.test/data"))

    expect(result).toBe("hello")
  })

  it("falls back to blob for other content types", async () => {
    fetchMock.mockResolvedValue(blobResponse())
    const client = createFetchClient()

    const result = await client.get(new URL("https://api.test/data"))

    expect(result).toBeInstanceOf(Blob)
  })
})

describe("error responses", () => {
  it("throws an ApiError with the response status and body on a non-ok response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "nope" }, 404))
    const client = createFetchClient()

    await expect(
      client.get(new URL("https://api.test/data"))
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      data: { message: "nope" },
    })
  })
})

describe("zod schema validation", () => {
  const schema = z.object({ id: z.number() })

  it("returns the parsed value when validation succeeds", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 1 }))
    const client = createFetchClient()

    const result = await client.get(
      new URL("https://api.test/data"),
      {},
      schema
    )

    expect(result).toEqual({ id: 1 })
  })

  it("wraps a schema validation failure in an ApiError(400) rather than letting a raw ZodError escape", async () => {
    // `executeFetch` now forwards `schema` into `processResponse`, which is the
    // single validation point and wraps a Zod failure in an ApiError. A raw
    // ZodError no longer escapes for any public method (get/post/etc.).
    fetchMock.mockResolvedValue(jsonResponse({ id: "not-a-number" }))
    const client = createFetchClient()

    await expect(
      client.get(new URL("https://api.test/data"), {}, schema)
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      message: "Response validation failed",
    })
  })
})

describe("timeout handling", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it("aborts and throws a 408 timeout ApiError when the request exceeds the timeout", async () => {
    fetchMock.mockImplementation(
      (_url: URL, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"))
          })
        })
    )
    const client = createFetchClient()

    const promise = client.get(new URL("https://api.test/data"), {
      timeout: 50,
    })
    const assertion = expect(promise).rejects.toMatchObject({
      name: "ApiError",
      status: 408,
      isTimeoutError: true,
    })

    await vi.advanceTimersByTimeAsync(50)
    await assertion
  })
})

describe("network error retry/backoff", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it("does not retry a network error unless the call opts into a retry policy", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
    // The client-level default retry config never gates retries on its own -
    // only a per-call `retry` option does. This test pins that behavior down.
    const client = createFetchClient()

    await expect(
      client.get(new URL("https://api.test/data"))
    ).rejects.toMatchObject({
      name: "ApiError",
      isNetworkError: true,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("retries with exponential backoff and eventually succeeds", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
    const client = createFetchClient()

    const promise = client.get(new URL("https://api.test/data"), {
      retry: { count: 2, delay: 100, backoffFactor: 2 },
    })

    await vi.advanceTimersByTimeAsync(100) // backoff before retry #1: 100 * 2^0
    await vi.advanceTimersByTimeAsync(200) // backoff before retry #2: 100 * 2^1

    await expect(promise).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("exhausts retries and throws a network ApiError", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
    const client = createFetchClient()

    const promise = client.get(new URL("https://api.test/data"), {
      retry: { count: 1, delay: 10, backoffFactor: 1 },
    })
    const assertion = expect(promise).rejects.toMatchObject({
      isNetworkError: true,
    })

    await vi.advanceTimersByTimeAsync(10)
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("does not retry a non-network error even with a retry policy configured", async () => {
    fetchMock.mockRejectedValue(new Error("boom"))
    const client = createFetchClient()

    await expect(
      client.get(new URL("https://api.test/data"), {
        retry: { count: 3, delay: 10 },
      })
    ).rejects.toMatchObject({ isNetworkError: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("ApiError", () => {
  it("defaults isNetworkError and isTimeoutError to false", () => {
    const error = new ApiError("bad", 500, { detail: "x" })

    expect(error.isNetworkError).toBe(false)
    expect(error.isTimeoutError).toBe(false)
    expect(error.status).toBe(500)
    expect(error.data).toEqual({ detail: "x" })
  })
})
