import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { ApiError, createFetchClient } from "."

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

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

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

  it("parses JSON served as text when asked to read it as JSON", async () => {
    fetchMock.mockResolvedValue(textResponse('{"foo":"bar"}'))
    const client = createFetchClient()

    const result = await client.get<{ foo: string }>(
      new URL("https://raw.test/data.json"),
      { responseAs: "json" }
    )

    expect(result).toEqual({ foo: "bar" })
  })

  it("reads JSON when the client's defaults ask for it", async () => {
    fetchMock.mockResolvedValue(textResponse('{"foo":"bar"}'))
    const client = createFetchClient({ responseAs: "json" })

    const result = await client.get(new URL("https://raw.test/data.json"))

    expect(result).toEqual({ foo: "bar" })
  })

  it("keeps a non-JSON error's status when asked to read JSON", async () => {
    fetchMock.mockResolvedValue(textResponse("404: Not Found", 404))
    const client = createFetchClient()

    const error = await client
      .get(new URL("https://raw.test/data.json"), { responseAs: "json" })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, data: "404: Not Found" })
  })

  it("falls back to blob for other content types", async () => {
    fetchMock.mockResolvedValue(blobResponse())
    const client = createFetchClient()

    const result = await client.get(new URL("https://api.test/data"))

    expect(result).toBeInstanceOf(Blob)
  })
})

describe("request headers", () => {
  const contentType = (): string | null =>
    new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Content-Type")

  it("sends no Content-Type on a request with no body, so a cross-origin GET needs no preflight", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    await createFetchClient().get(new URL("https://raw.test/data.json"))

    expect(contentType()).toBeNull()
  })

  it("still describes a JSON body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    await createFetchClient().post(new URL("https://api.test/data"), { a: 1 })

    expect(contentType()).toBe("application/json")
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
    // `processResponse` is the single validation point and wraps a Zod
    // failure in an ApiError, for every public method.
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
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
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
    // The client-level default retry config never gates retries on its own;
    // only a per-call `retry` option does.

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

// Promise FK1 (`executeFetch`'s doc comment). Family: when the caller's
// signal aborts (before the call, during an attempt, during a backoff, never)
// × the call's retry count (absent, 0, n) × what an attempt meets (network
// error, its own timeout). Each cell below is one of those states.
describe("caller cancellation and the attempt budget (FK1)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  function hangsUntilAborted(): void {
    fetchMock.mockImplementation(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"))
          })
        })
    )
  }

  it("starts no attempt when the caller has already cancelled", async () => {
    const caller = new AbortController()
    caller.abort()

    await expect(
      createFetchClient().get(new URL("https://api.test/data"), {
        signal: caller.signal,
      })
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("passes the caller's cancellation to the attempt in flight, as a cancellation, not a timeout", async () => {
    hangsUntilAborted()
    const caller = new AbortController()
    const promise = createFetchClient().get(new URL("https://api.test/data"), {
      signal: caller.signal,
      timeout: 1000,
    })
    const assertion = expect(promise).rejects.toMatchObject({
      name: "AbortError",
    })

    await vi.advanceTimersByTimeAsync(10)
    caller.abort()
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("still reports its own timeout as a timeout when the caller's signal never aborts", async () => {
    hangsUntilAborted()
    const caller = new AbortController()
    const promise = createFetchClient().get(new URL("https://api.test/data"), {
      signal: caller.signal,
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

  it("ends a waiting backoff when the caller cancels, and starts no further attempt", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
    const caller = new AbortController()
    const promise = createFetchClient().get(new URL("https://api.test/data"), {
      signal: caller.signal,
      retry: { count: 3, delay: 1000 },
    })
    const assertion = expect(promise).rejects.toMatchObject({
      name: "AbortError",
    })

    await vi.advanceTimersByTimeAsync(10)
    caller.abort()
    await assertion
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    { retry: undefined, attempts: 1 },
    { retry: { count: 0, delay: 10 }, attempts: 1 },
    { retry: { count: 2, delay: 10 }, attempts: 3 },
  ])(
    "makes 1 + the call's retry count attempts on a network error (retry: $retry)",
    async ({ retry, attempts }) => {
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
      // A client default of 1 never stands in for the call's own count.
      const promise = createFetchClient({
        retry: { count: 1, delay: 10 },
      }).get(new URL("https://api.test/data"), { retry })
      const assertion = expect(promise).rejects.toMatchObject({
        isNetworkError: true,
      })

      await vi.advanceTimersByTimeAsync(1000)
      await assertion
      expect(fetchMock).toHaveBeenCalledTimes(attempts)
    }
  )
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
