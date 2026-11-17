/**
 * Promise NA1 (#3099): the phone says "Away from home" only when home gave
 * no answer.
 * - Claim: a request to home that failed because this phone couldn't find
 *   home's name on this network, or doesn't trust home's certificate, is
 *   said as that, never as away (AW1) and never as a fault on the phone; a
 *   refused connection or a timeout stays home's silence. A pairing 503 is
 *   read by its code: `service_overloaded` is home busy (or its cap on
 *   tries, with no `Retry-After`), anything else is pairing not set up.
 * - Family: the kind of failure (a name not found, an untrusted
 *   certificate, a refused connection, a timeout, the app's own deadline,
 *   a missing plugin) × who says it (`native-http`'s error, the link's
 *   state, a lane's run and its words, the sign-in sheet, pairing's line);
 *   and a pairing 503's code × whether it has a `Retry-After`.
 * - Proof: these tests, over `native-http`'s `classify` with the platform's
 *   own messages, the link's `heard` over the real runtime, a lane's run,
 *   `laneView` (`./words.test.ts`) and `signInView`.
 * - Tolerance: the platform's messages are matched by their words, as
 *   pairing always has; a failure Android words otherwise is home's
 *   silence. A request a router drops without a word is a timeout, so away.
 */
import { fakeClock } from "@/test-support/fake-clock"
import { noAnswer } from "@/test-support/no-answer"
import type { HomeAnswer, HomeExchanged } from "@some-ui/core-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { homeRequest } from "@/lib/device-backend/native-http"
import type { HomeRequest } from "@/lib/device-backend/native-http"
import {
  blockedReason,
  HomeBlockedError,
  HomeNoAnswerError,
} from "@/lib/device-backend/native-http/no-answer"
import { createKept } from "@/lib/home-link/kept-runtime"
import type { HomeLinkState } from "@/lib/home-link/model"
import { INITIAL, step } from "@/lib/home-link/model"
import { createHomeLink } from "@/lib/home-link/runtime"
import { pairFailureLine, signInView } from "@/lib/home-link/sign-in-words"

import { MACHINERY } from "./machinery"

const plugin = vi.hoisted(() => ({
  request: vi.fn<(options: unknown) => Promise<unknown>>(),
}))
vi.mock("@capacitor/core", () => ({ CapacitorHttp: plugin }))

beforeEach(() => {
  plugin.request.mockReset()
})

const HOME = { base: "https://home.example/api/v1", host: "home.example" }
const URL_ = `${HOME.base}/x`

/** Android's own words for each failure, as the plugin rejects with them. */
const ANDROID = {
  name: new Error(
    'java.net.UnknownHostException: Unable to resolve host "home.example": No address associated with hostname'
  ),
  trust: new Error(
    "javax.net.ssl.SSLHandshakeException: java.security.cert.CertPathValidatorException: Trust anchor for certification path not found."
  ),
  refused: new Error(
    "java.net.ConnectException: Failed to connect to /10.0.0.202:443"
  ),
  timeout: new Error("java.net.SocketTimeoutException: timeout"),
} as const

const failureOf = async (error: unknown): Promise<unknown> => {
  plugin.request.mockRejectedValue(error)
  return homeRequest({ method: "GET", url: URL_ }).catch((e: unknown) => e)
}

describe("NA1: which failure the phone's request met (native-http)", () => {
  it("tells a name not found and an untrusted certificate apart from silence", async () => {
    const name = await failureOf(ANDROID.name)
    expect(name).toBeInstanceOf(HomeBlockedError)
    expect(name).not.toBeInstanceOf(HomeNoAnswerError)
    expect(name).toMatchObject({ reason: "name" })

    const trust = await failureOf(ANDROID.trust)
    expect(trust).toBeInstanceOf(HomeBlockedError)
    expect(trust).toMatchObject({ reason: "trust" })

    for (const silence of [ANDROID.refused, ANDROID.timeout]) {
      const error = await failureOf(silence)
      expect(error).toBeInstanceOf(HomeNoAnswerError)
      expect(error).not.toBeInstanceOf(HomeBlockedError)
    }
  })

  it("reads the platform's words wherever they sit in the cause chain", () => {
    expect(blockedReason(new Error("wrapped", { cause: ANDROID.name }))).toBe(
      "name"
    )
    expect(blockedReason({ message: String(ANDROID.trust) })).toBe("trust")
    expect(blockedReason(ANDROID.refused)).toBeNull()
    expect(blockedReason(null)).toBeNull()
  })
})

const PAIRED = JSON.stringify({
  base: HOME.base,
  token: "t",
  id: "p1",
  pairedAt: 1,
})

/** A link over a paired phone whose requests meet `answer`. */
function pairedLink(answer: (call: HomeRequest) => Promise<HomeAnswer>): {
  link: ReturnType<typeof createHomeLink>
  pass: (ms: number) => void
} {
  const clock = fakeClock()
  const link = createHomeLink({
    credential: {
      read: () => Promise.resolve({ record: PAIRED, lost: false }),
      write: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    },
    request: answer,
    onHidden: () => (): void => undefined,
    now: clock.now,
    after: clock.after,
  })
  return { link, pass: clock.pass }
}

const blockedError = (reason: "name" | "trust"): HomeBlockedError =>
  new HomeBlockedError(
    {
      kind: "rejected",
      retryable: true,
      summary: "blocked",
      cause: ANDROID[reason],
    },
    reason
  )

describe("NA1: what the link makes of it", () => {
  it("never holds the phone away for a name or a certificate, and an answer clears it", async () => {
    let next: () => Promise<HomeAnswer> = () =>
      Promise.reject(blockedError("name"))
    const { link } = pairedLink(() => next())
    await link.load()
    const run = (): Promise<unknown> =>
      link.send((send) => send("GET", "/x")).catch((e: unknown) => e)

    await run()
    expect(link.getSnapshot().away).toBeNull()
    expect(link.getSnapshot().blocked).toMatchObject({ reason: "name" })

    next = (): Promise<HomeAnswer> => Promise.reject(blockedError("trust"))
    await run()
    expect(link.getSnapshot().blocked).toMatchObject({ reason: "trust" })
    expect(link.getSnapshot().away).toBeNull()

    next = (): Promise<HomeAnswer> =>
      Promise.resolve({ status: 200, body: "{}" })
    await run()
    expect(link.getSnapshot().blocked).toBeNull()
  })

  it("says home's silence as away, and clears what blocked a request before", async () => {
    let next: () => Promise<HomeAnswer> = () =>
      Promise.reject(blockedError("name"))
    const { link } = pairedLink(() => next())
    await link.load()
    await link.send((send) => send("GET", "/x")).catch(() => undefined)
    next = (): Promise<HomeAnswer> => Promise.reject(noAnswer())
    await link.send((send) => send("GET", "/x")).catch(() => undefined)
    expect(link.getSnapshot().blocked).toBeNull()
    expect(link.getSnapshot().away).not.toBeNull()
  })

  it("forgets what blocked a request on a network change, a new pairing or a sign-out", () => {
    const paired = step(INITIAL, {
      type: "read",
      found: { base: HOME.base, id: "p1", since: 1 },
    })
    const blocked = step(paired, { type: "blocked", reason: "name", at: 5 })
    expect(blocked.blocked).toEqual({ reason: "name", at: 5 })
    expect(step(blocked, { type: "lookAgain", fresh: true }).blocked).toBeNull()
    // A pull is not a network change: what it meets says itself again.
    expect(step(blocked, { type: "lookAgain", fresh: false }).blocked).toEqual(
      blocked.blocked
    )
    const signedOut = [
      { type: "unpairPressed" } as const,
      { type: "unpaired", told: true } as const,
    ].reduce(step, blocked)
    expect(signedOut.blocked).toBeNull()
    // Unpaired, nothing is blocked.
    expect(step(signedOut, { type: "blocked", reason: "trust", at: 6 })).toBe(
      signedOut
    )
  })

  it("ends a lane's run as blocked, neither away nor a fault on the phone", async () => {
    const kept = createKept({
      exchange: (): Promise<HomeExchanged> =>
        Promise.resolve({ kind: "synced" }),
      keep: () => Promise.reject(blockedError("trust")),
      paired: () => true,
      homeBusy: () => false,
      now: () => 1,
    })
    kept.want()
    await vi.waitFor(() => expect(kept.getSnapshot().running).toBe(false))
    expect(kept.getSnapshot().last).toEqual({ kind: "failed", why: "blocked" })
  })
})

describe("NA1: what the person reads", () => {
  const paired: HomeLinkState = step(INITIAL, {
    type: "read",
    found: { base: HOME.base, id: "p1", since: null },
  })

  it("says on the sign-in sheet which it was, never away, in the person's terms", () => {
    for (const reason of ["name", "trust"] as const) {
      const view = signInView(step(paired, { type: "blocked", reason, at: 2 }))
      const words = [view.label, view.line, ...view.notes].join(" ")
      expect(words).not.toMatch(/away/i)
      expect(words).not.toMatch(MACHINERY)
      expect(words).toMatch(reason === "name" ? /home's name/ : /certificate/)
      expect(words).toMatch(/waits on this phone/)
    }
  })

  it("says a pairing that met either as itself", () => {
    expect(pairFailureLine("no-name", "home.example")).toMatch(
      /can't find home\.example on this network/
    )
    expect(pairFailureLine("untrusted", "home.example")).toMatch(/certificate/)
  })
})

describe("a pairing 503, read by home's code", () => {
  const pairing = async (answer: HomeAnswer): Promise<string | null> => {
    const clock = fakeClock()
    const link = createHomeLink({
      credential: {
        read: () => Promise.resolve({ record: null, lost: false }),
        write: () => Promise.resolve(),
        clear: () => Promise.resolve(),
      },
      request: () => Promise.resolve(answer),
      onHidden: () => (): void => undefined,
      now: clock.now,
      after: clock.after,
    })
    await link.load()
    await link.pair(HOME, "K7QF2M9X")
    return link.getSnapshot().pairFailure?.failure ?? null
  }
  const overloaded = JSON.stringify({ error: { code: "service_overloaded" } })

  it("is home busy with a Retry-After, its cap on tries without one, and not set up otherwise", async () => {
    expect(
      await pairing({ status: 503, body: overloaded, retryAfter: "5" })
    ).toBe("busy")
    expect(await pairing({ status: 503, body: overloaded })).toBe("too-many")
    expect(
      await pairing({
        status: 503,
        body: JSON.stringify({ error: { code: "feature_not_configured" } }),
      })
    ).toBe("not-set-up")
    expect(await pairing({ status: 503, body: "not json" })).toBe("not-set-up")
  })
})
