/**
 * @vitest-environment jsdom
 *
 * `lib/auth/session` holds the client's belief about its session and runs
 * the passkey ceremonies. The server is faked at the transport seam
 * (`FileHostTransport`), and the browser's WebAuthn prompt at
 * `lib/passkey`, so what is asserted is exactly what this module sends and
 * what it concludes from each answer.
 *
 * `useHasSession` exists so providers mounted above the router (the TTS
 * provider, the study nudge watcher) react to sign-in without a route change
 * to force their re-render: without a subscription, a query enabled off a
 * one-time `hasSession()` read would stay disabled for the rest of the tab's
 * life once flipped true.
 */

import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { authority } from "@/lib/authority"
import type { FileHostTransport } from "@/lib/file-host-config/client"

type Call = { route: string; init?: RequestInit }

const server = vi.hoisted(() => {
  const calls: Array<{ route: string; init?: RequestInit }> = []
  const answer = (_route: string): Response | Promise<Response> =>
    new Response("{}", { status: 200 })
  return { calls, answer }
})

vi.mock("@/lib/file-host-config/client", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createFileHostTransport:
    (): FileHostTransport =>
    (route: string, init?: RequestInit): Promise<Response> => {
      server.calls.push({ route, init })
      return Promise.resolve(server.answer(route))
    },
}))

vi.mock("@/lib/passkey", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createPasskey: (options: unknown): Promise<unknown> =>
    Promise.resolve({ created: true, from: options }),
  signWithPasskey: (options: unknown): Promise<unknown> =>
    Promise.resolve({ signed: true, from: options }),
}))

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

const unauthorized = (): Response =>
  json(
    { error: { code: "unauthorized", message: "authentication required" } },
    401
  )

function bodyOf(call: Call | undefined): unknown {
  return JSON.parse(String(call?.init?.body))
}

const auth = await import("@/lib/auth")

beforeEach(() => {
  window.localStorage.clear()
  server.calls.length = 0
  server.answer = (): Response => json({})
  auth.resetSessionForTests()
})

afterEach(() => {
  auth.resetSessionForTests()
})

describe("useHasSession", () => {
  it("starts false and flips, in the same render tree, the moment a session starts or ends", () => {
    const { result } = renderHook(() => auth.useHasSession())
    expect(result.current).toBe(false)

    act(() => auth.markSignedIn())
    expect(result.current).toBe(true)

    act(() => auth.markSignedOut())
    expect(result.current).toBe(false)
  })
})

describe("resolveSession", () => {
  it("believes the server: 200 is signed in", async () => {
    server.answer = (): Response => json({ expiresAt: 1 })
    await expect(auth.resolveSession()).resolves.toBe(true)
    expect(auth.getSessionStatus()).toBe("signed-in")
    expect(server.calls.map((call) => call.route)).toEqual(["/auth/session"])
  })

  it("believes the server: 401 is signed out", async () => {
    server.answer = unauthorized
    await expect(auth.resolveSession()).resolves.toBe(false)
    expect(auth.getSessionStatus()).toBe("signed-out")
  })

  it("asks once per page load, however many guards ask at once", async () => {
    server.answer = (): Response => json({ expiresAt: 1 })
    await Promise.all([auth.resolveSession(), auth.resolveSession()])
    await auth.resolveSession()
    expect(server.calls).toHaveLength(1)
  })

  it("does not read an unreachable server as a lost session, or hang the guard", async () => {
    server.answer = (): Response => {
      throw new TypeError("Failed to fetch")
    }
    await expect(auth.resolveSession()).resolves.toBe(false)
    expect(auth.getSessionStatus()).toBe("unreachable")
  })

  it("reads any answer that is not a 401 as saying nothing about the session", async () => {
    server.answer = (): Response =>
      new Response("{}", {
        status: 502,
        headers: { "content-type": "application/json" },
      })
    await expect(auth.resolveSession()).resolves.toBe(false)
    expect(auth.getSessionStatus()).toBe("unreachable")
  })

  it("asks again after an outage, and believes the answer when it comes", async () => {
    let up = false
    server.answer = (): Response => {
      if (!up) throw new TypeError("Failed to fetch")
      return json({ expiresAt: 1 })
    }
    await auth.resolveSession()
    up = true
    await expect(auth.resolveSession()).resolves.toBe(true)
    expect(auth.getSessionStatus()).toBe("signed-in")
    expect(server.calls).toHaveLength(2)
  })

  it("keeps a returning account user on the account through an outage", async () => {
    window.localStorage.setItem(
      "some-ui.authority.v1",
      JSON.stringify({ choice: "account" })
    )
    auth.resetSessionForTests()
    server.answer = (): Response => {
      throw new TypeError("Failed to fetch")
    }
    await auth.resolveSessionIfChosen()
    // Not the device: new work would otherwise land in a store the person did
    // not choose, and never be probed for again.
    expect(authority.getAuthority().kind).toBe("account")
    expect(authority.getSnapshot().accountUnavailable).toBe(false)
  })
})

describe("resolveSessionIfChosen", () => {
  it("sends nothing for someone who never chose their account", async () => {
    server.answer = (): Response => json({ expiresAt: 1 })
    await expect(auth.resolveSessionIfChosen()).resolves.toBe(false)
    expect(server.calls).toEqual([])
    expect(auth.getSessionStatus()).toBe("unknown")
  })

  it("asks once for someone who did, and believes the answer", async () => {
    window.localStorage.setItem(
      "some-ui.authority.v1",
      JSON.stringify({ choice: "account" })
    )
    auth.resetSessionForTests()
    server.answer = (): Response => json({ expiresAt: 1 })

    await expect(auth.resolveSessionIfChosen()).resolves.toBe(true)
    await auth.resolveSessionIfChosen()
    expect(server.calls.map((call) => call.route)).toEqual(["/auth/session"])
  })
})

describe("what signing in and out do to where the data lives", () => {
  it("adopting the account on a ceremony, and forgetting it only when the person leaves", async () => {
    const { authority } = await import("@/lib/authority")
    expect(authority.getSnapshot().choice).toBe("local")

    await auth.signIn()
    expect(authority.getSnapshot().authority.kind).toBe("account")
    expect(authority.getSnapshot().choice).toBe("account")

    await auth.signOut()
    expect(authority.getSnapshot().authority.kind).toBe("local")
    expect(authority.getSnapshot().choice).toBe("local")
  })

  it("keeps the account as the person's choice when a request meets a 401", async () => {
    const { authority } = await import("@/lib/authority")
    const { createFileHostTransport, requestJSON } = await import(
      "@/lib/file-host-config/client"
    )
    await auth.signIn()
    server.answer = unauthorized
    const transport = createFileHostTransport("ceremony")
    if (!transport) throw new Error("the mocked transport is always present")

    await expect(requestJSON(transport, "/sessions")).rejects.toThrow()

    expect(authority.getSnapshot().authority.kind).toBe("local")
    expect(authority.getSnapshot().choice).toBe("account")
    expect(authority.getSnapshot().accountUnavailable).toBe(true)
  })
})

describe("a probe overtaken by a ceremony", () => {
  it("does not sign the person back out when its late 401 arrives", async () => {
    let release: () => void = () => undefined
    server.answer = (route: string): Response | Promise<Response> => {
      if (route === "/auth/session") {
        return new Promise<Response>((resolve) => {
          release = (): void => resolve(unauthorized())
        })
      }
      return route === "/auth/sign-in/start"
        ? json({ ceremony: "c-2", options: { publicKey: { challenge: "y" } } })
        : json({ expiresAt: 1 })
    }

    const probe = auth.resolveSession()
    await auth.signIn()
    release()

    await expect(probe).resolves.toBe(true)
    expect(auth.getSessionStatus()).toBe("signed-in")
  })
})

describe("onAccountChange", () => {
  it("fires when a session ends or a ceremony starts one, not when a page load finds one", async () => {
    const changes = vi.fn()
    const stop = auth.onAccountChange(changes)
    server.answer = (route: string): Response =>
      route === "/auth/sign-in/start"
        ? json({ ceremony: "c-3", options: { publicKey: { challenge: "z" } } })
        : json({ expiresAt: 1 })

    await auth.resolveSession()
    expect(changes).not.toHaveBeenCalled()

    auth.markSignedOut()
    expect(changes).toHaveBeenCalledTimes(1)
    auth.markSignedOut()
    expect(changes).toHaveBeenCalledTimes(1)

    await auth.signIn()
    expect(changes).toHaveBeenCalledTimes(2)
    stop()
  })
})

describe("a 401 from any file_host request", () => {
  it("ends the client's belief in its session", async () => {
    const { createFileHostTransport, requestJSON } = await import(
      "@/lib/file-host-config/client"
    )
    auth.markSignedIn()
    server.answer = unauthorized
    const transport = createFileHostTransport("ceremony")
    if (!transport) throw new Error("the mocked transport is always present")

    await expect(requestJSON(transport, "/sessions")).rejects.toThrow()
    expect(auth.hasSession()).toBe(false)
  })
})

describe("ceremonies", () => {
  it("creates an account: start, the passkey prompt, then finish with its ceremony", async () => {
    server.answer = (route: string): Response =>
      route === "/auth/register/start"
        ? json({ ceremony: "c-1", options: { publicKey: { challenge: "x" } } })
        : json({ expiresAt: 1 })

    await auth.createAccount()

    expect(server.calls.map((call) => [call.route, call.init?.method])).toEqual(
      [
        ["/auth/register/start", "POST"],
        ["/auth/register/finish", "POST"],
      ]
    )
    expect(bodyOf(server.calls[1])).toEqual({
      ceremony: "c-1",
      credential: { created: true, from: { publicKey: { challenge: "x" } } },
    })
    expect(auth.hasSession()).toBe(true)
  })

  it("carries an operator's claim token to the register finish, and only there", async () => {
    server.answer = (route: string): Response =>
      route === "/auth/register/start"
        ? json({ ceremony: "c-1", options: { publicKey: { challenge: "x" } } })
        : json({ expiresAt: 1 })

    await auth.createAccount("t0ken")

    expect(server.calls[0]?.init?.body).toBeUndefined()
    expect(bodyOf(server.calls[1])).toEqual({
      ceremony: "c-1",
      credential: { created: true, from: { publicKey: { challenge: "x" } } },
      legacyClaim: "t0ken",
    })
  })

  it("signs in the same way, through the sign-in routes", async () => {
    server.answer = (route: string): Response =>
      route === "/auth/sign-in/start"
        ? json({ ceremony: "c-2", options: { publicKey: { challenge: "y" } } })
        : json({ expiresAt: 1 })

    await auth.signIn()

    expect(server.calls.map((call) => call.route)).toEqual([
      "/auth/sign-in/start",
      "/auth/sign-in/finish",
    ])
    expect(bodyOf(server.calls[1])).toEqual({
      ceremony: "c-2",
      credential: { signed: true, from: { publicKey: { challenge: "y" } } },
    })
    expect(auth.hasSession()).toBe(true)
  })

  it("stays signed out when the server refuses the passkey", async () => {
    server.answer = (route: string): Response =>
      route === "/auth/sign-in/start"
        ? json({ ceremony: "c-3", options: { publicKey: { challenge: "z" } } })
        : unauthorized()

    await expect(auth.signIn()).rejects.toThrow()
    expect(auth.hasSession()).toBe(false)
  })

  it("adds a passkey without touching the session", async () => {
    auth.markSignedIn()
    server.answer = (route: string): Response =>
      route === "/auth/passkeys/start"
        ? json({ ceremony: "c-4", options: { publicKey: { challenge: "w" } } })
        : json({})

    await auth.addPasskey()

    expect(server.calls.map((call) => call.route)).toEqual([
      "/auth/passkeys/start",
      "/auth/passkeys/finish",
    ])
    expect(auth.hasSession()).toBe(true)
  })
})

describe("readLegacyClaim", () => {
  it.each([
    ["#claim=t0ken", "t0ken"],
    ["#claim=a%2Bb", "a+b"],
    ["#claim=", undefined],
    ["#other=1", undefined],
    ["", undefined],
  ])("reads %j as %j", (hash, claim) => {
    expect(auth.readLegacyClaim(hash)).toBe(claim)
  })
})

describe("leaving", () => {
  it.each([
    ["signOut", "/auth/sign-out", "POST"],
    ["signOutEverywhere", "/auth/sign-out-everywhere", "POST"],
    ["deleteAccount", "/auth/account", "DELETE"],
  ] as const)(
    "%s calls %s and ends the session",
    async (name, route, method) => {
      auth.markSignedIn()
      await auth[name]()
      expect(
        server.calls.map((call) => [call.route, call.init?.method])
      ).toEqual([[route, method]])
      expect(auth.hasSession()).toBe(false)
    }
  )

  it("treats an already-ended session as the outcome asked for", async () => {
    auth.markSignedIn()
    server.answer = unauthorized
    await expect(auth.signOut()).resolves.toBeUndefined()
    expect(auth.hasSession()).toBe(false)
  })
})
