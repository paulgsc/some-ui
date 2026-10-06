/**
 * `requestJSON`'s bounded wait, against hand-built `FileHostTransport`s: the
 * deadline covers the whole request (`client.ts`'s header), and only a fake
 * transport can easily say "headers arrived, body never resolves".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { authority, StaleAuthorityError } from "@/lib/authority"
import { FileHostUnreachableError } from "@/lib/file-host-config"
import type { FileHostTransport } from "@/lib/file-host-config/client"
import {
  createFileHostTransport,
  FileHostNotConfiguredError,
  requestJSON,
} from "@/lib/file-host-config/client"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("requestJSON: what a 503 means", () => {
  const answering =
    (code: string): FileHostTransport =>
    () =>
      Promise.resolve(
        Response.json({ error: { code, message: "m" } }, { status: 503 })
      )

  it("reads feature_not_configured as a feature this deployment lacks", async () => {
    await expect(
      requestJSON(answering("feature_not_configured"), "auth/sign-in/start")
    ).rejects.toBeInstanceOf(FileHostNotConfiguredError)
  })

  it("reads service_overloaded (a busy server, a spent daily cap) as an answer with its code", async () => {
    await expect(
      requestJSON(answering("service_overloaded"), "auth/register/start")
    ).rejects.toMatchObject({ status: 503, code: "service_overloaded" })
  })
})

describe("createFileHostTransport: credentials", () => {
  const fetchSpy = (): ReturnType<typeof vi.fn> => {
    const spy = vi.fn(() => Promise.resolve(new Response("{}")))
    vi.stubGlobal("fetch", spy)
    return spy
  }

  it("sends the session cookie to a published-port file_host, which is cross-origin", async () => {
    const spy = fetchSpy()
    const transport = createFileHostTransport("ceremony", {
      baseUrl: "http://localhost:3000/api/v1",
      source: "published-port",
    })

    await transport?.("auth/session")

    expect(spy).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/auth/session",
      expect.objectContaining({ credentials: "include" })
    )
  })

  it("lets a caller of an uncredentialed read module opt out", async () => {
    const spy = fetchSpy()
    const transport = createFileHostTransport("ceremony", {
      baseUrl: "http://localhost:3000/api/v1",
      source: "published-port",
    })

    await transport?.("curriculum", { credentials: "same-origin" })

    expect(spy).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/curriculum",
      expect.objectContaining({ credentials: "same-origin" })
    )
  })
})

describe("createFileHostTransport: what each purpose needs", () => {
  const resolution = {
    baseUrl: "http://localhost:3000/api/v1",
    source: "published-port",
  } as const

  beforeEach(() => {
    authority.resetForTests()
  })

  it("hands out neither an account nor a reporting transport while learning on the device", () => {
    expect(createFileHostTransport("account", resolution)).toBeNull()
    expect(createFileHostTransport("reporting", resolution)).toBeNull()
    // A ceremony is the person's own act and needs no authority.
    expect(createFileHostTransport("ceremony", resolution)).not.toBeNull()
  })

  it("hands out an account transport on the account, and a reporting one only once the person opted in", () => {
    authority.dispatch({ type: "session-started", adopt: true })
    expect(createFileHostTransport("account", resolution)).not.toBeNull()
    expect(createFileHostTransport("reporting", resolution)).toBeNull()

    authority.setReporting(true)
    expect(createFileHostTransport("reporting", resolution)).not.toBeNull()
  })

  it("stops a reporting transport that was issued while reporting was on", async () => {
    const spy = vi.fn(() => Promise.resolve(new Response("{}")))
    vi.stubGlobal("fetch", spy)
    authority.dispatch({ type: "session-started", adopt: true })
    authority.setReporting(true)
    const transport = createFileHostTransport("reporting", resolution)

    await transport?.("signals")
    expect(spy).toHaveBeenCalledTimes(1)

    authority.setReporting(false)
    await expect(transport?.("signals")).rejects.toBeInstanceOf(
      StaleAuthorityError
    )
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("stops an account transport once another account has signed in", async () => {
    const spy = vi.fn(() => Promise.resolve(new Response("{}")))
    vi.stubGlobal("fetch", spy)
    authority.dispatch({ type: "session-started", adopt: true })
    const transport = createFileHostTransport("account", resolution)
    authority.dispatch({ type: "session-started", adopt: true })

    await expect(transport?.("sessions")).rejects.toBeInstanceOf(
      StaleAuthorityError
    )
    expect(spy).not.toHaveBeenCalled()
  })
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

  it("marks a timed-out POST retryable when the caller says it converges (the lesson CRM's retire/restore)", async () => {
    vi.stubEnv("VITE_FILE_HOST_TIMEOUT_MS", "30")
    const hangingTransport: FileHostTransport = () =>
      new Promise<Response>(() => {})

    await expect(
      requestJSON(
        hangingTransport,
        "curriculum/operator/lessons/a/retire",
        { method: "POST" },
        { idempotent: true }
      )
    ).rejects.toMatchObject({ retryable: true })
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
