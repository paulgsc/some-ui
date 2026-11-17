/**
 * Promise NA1 (#3099): the phone says "Away from home" only when home gave
 * no answer.
 * - Claim: a request to home that failed because this phone couldn't find
 *   home's name on the network it is on, or doesn't trust home's
 *   certificate, is said as that, never as away and never as a fault on the
 *   phone, though it is held as a silence is (AW1, C476); a refused
 *   connection, a timeout, a TLS connection dropped or timed out, or a name
 *   failing on no network at all stays home's silence. A pairing 503 is
 *   read by its code: `service_overloaded` is home busy (or its cap on
 *   tries, with no `Retry-After`), anything else is pairing not set up.
 * - Family: the kind of failure (a name not found, an untrusted
 *   certificate, a refused connection, a timeout, a TLS connection dropped
 *   or timed out, a missing plugin) × whether the phone is on any network
 *   × who says it (`native-http`'s error, the link's
 *   state, a lane's run and its words, the sign-in sheet, pairing's line);
 *   and a pairing 503's code × whether it has a `Retry-After`.
 * - Proof: these tests, over `native-http`'s `classify` with the platform's
 *   own messages, the link's `heard` over the real runtime, a lane's run,
 *   `laneView` (`./words.test.ts`) and `signInView`.
 * - Tolerance: the platform's messages and exception classes are matched
 *   by their words; a failure Android words otherwise is home's silence. A
 *   request a router drops without a word is a timeout, so away. On mobile
 *   data, a name only the home router knows fails as a blocked name, said
 *   with "on your home network" so it reads true either way. The app's own
 *   deadline is `ForeignDeadlineError`, never matched, so a silence.
 */
import { fakeClock } from "@/test-support/fake-clock"
import { noAnswer } from "@/test-support/no-answer"
import type { HomeAnswer, HomeExchanged } from "@some-ui/core-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

/**
 * Each failure as Capacitor's HTTP plugin rejects with it on Android:
 * `getLocalizedMessage()` as `message`, the exception's class as `code`.
 */
const ANDROID = {
  name: {
    message:
      'Unable to resolve host "home.example": No address associated with hostname',
    code: "UnknownHostException",
  },
  trust: {
    message:
      "java.security.cert.CertPathValidatorException: Trust anchor for certification path not found.",
    code: "SSLHandshakeException",
  },
  unverified: {
    message: "Hostname home.example not verified",
    code: "SSLPeerUnverifiedException",
  },
  refused: {
    message: "Failed to connect to /10.0.0.202:443",
    code: "ConnectException",
  },
  timeout: { message: "timeout", code: "SocketTimeoutException" },
  // A TLS connection dropped or timed out is no answer, not a certificate.
  tlsDropped: {
    message:
      "SSL handshake aborted: ssl=0x7a: I/O error during system call, Software caused connection abort",
    code: "SSLHandshakeException",
  },
  tlsTimedOut: {
    message: "SSL handshake timed out",
    code: "SocketTimeoutException",
  },
} as const

const failureOf = async (error: unknown): Promise<unknown> => {
  plugin.request.mockRejectedValue(error)
  return homeRequest({ method: "GET", url: URL_ }).catch((e: unknown) => e)
}

describe("NA1: which failure the phone's request met (native-http)", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("tells a name not found and an untrusted certificate apart from silence", async () => {
    for (const [error, reason] of [
      [ANDROID.name, "name"],
      [ANDROID.trust, "trust"],
      [ANDROID.unverified, "trust"],
    ] as const) {
      const failed = await failureOf(error)
      expect(failed).toBeInstanceOf(HomeBlockedError)
      expect(failed).not.toBeInstanceOf(HomeNoAnswerError)
      expect(failed).toMatchObject({ reason })
    }
    for (const silence of [
      ANDROID.refused,
      ANDROID.timeout,
      ANDROID.tlsDropped,
      ANDROID.tlsTimedOut,
    ]) {
      const failed = await failureOf(silence)
      expect(failed).toBeInstanceOf(HomeNoAnswerError)
      expect(failed).not.toBeInstanceOf(HomeBlockedError)
    }
  })

  it("reads a name failure on no network at all as away, since every name fails there", async () => {
    vi.stubGlobal("navigator", { onLine: false })
    expect(await failureOf(ANDROID.name)).toBeInstanceOf(HomeNoAnswerError)
    // A certificate is the certificate's, whatever the network.
    expect(await failureOf(ANDROID.trust)).toBeInstanceOf(HomeBlockedError)
  })

  it("leaves a build without the plugin a fault on the phone, neither silence nor blocked", async () => {
    const missing = await failureOf({ code: "UNIMPLEMENTED" })
    expect(missing).not.toBeInstanceOf(HomeNoAnswerError)
    expect(missing).not.toBeInstanceOf(HomeBlockedError)
  })

  it("reads the platform's words wherever they sit in the cause chain", () => {
    expect(blockedReason(new Error("wrapped", { cause: ANDROID.name }))).toBe(
      "name"
    )
    expect(blockedReason({ message: ANDROID.trust.message })).toBe("trust")
    expect(blockedReason(ANDROID.name, false)).toBeNull()
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
  it("holds as a silence does, but keeps which it was, and an answer clears both", async () => {
    let next: () => Promise<HomeAnswer> = () =>
      Promise.reject(blockedError("name"))
    const { link } = pairedLink(() => next())
    await link.load()
    const run = (): Promise<unknown> =>
      link.send((send) => send("GET", "/x")).catch((e: unknown) => e)

    await run()
    expect(link.getSnapshot().away).not.toBeNull()
    expect(link.getSnapshot().blocked).toMatchObject({ reason: "name" })

    next = (): Promise<HomeAnswer> => Promise.reject(blockedError("trust"))
    await run()
    expect(link.getSnapshot().blocked).toMatchObject({ reason: "trust" })

    next = (): Promise<HomeAnswer> =>
      Promise.resolve({ status: 200, body: "{}" })
    await run()
    expect(link.getSnapshot().blocked).toBeNull()
    expect(link.getSnapshot().away).toBeNull()
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
