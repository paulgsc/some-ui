/**
 * A request to home that found no answer: the connection failed or timed
 * out (`classify`'s `unreachable` in `./index`). A `ForeignCallError`, so
 * `mapFileHostError` reads it as before; its own class, so the link can tell
 * home's silence from any other foreign failure on this phone (a Keystore
 * read, a plugin missing from the build). Apart from `./index`, so naming it
 * imports no request.
 */
import type { IntentError } from "@some-ui/intent-kit"

import { ForeignCallError } from "@/lib/intent/foreign"

export class HomeNoAnswerError extends ForeignCallError {
  override name = "HomeNoAnswerError"
}

/**
 * What the link answers, sending nothing, while the phone is held away from
 * home (AW1, `lib/home-link/away`): read as home's silence, as it is.
 */
export class HomeAwayError extends HomeNoAnswerError {
  override name = "HomeAwayError"

  constructor() {
    super({
      kind: "unreachable",
      retryable: true,
      summary: "Away from home: nothing was sent.",
      cause: null,
    })
  }
}

/**
 * Why a request to home failed before home could answer, though home may
 * be right there (#3099, NA1): this phone couldn't find home's name on this
 * network (a router blocking a public name for a private address, say), or
 * it doesn't trust home's certificate; or home's address answered for it
 * that home itself didn't (`door`, HR1: a `502` or `504` from what stands
 * in front of home's server, as while it restarts to update). None is
 * home's silence, so none is away (AW1). Only `name` and `trust` come from
 * a request failing (`blockedReason`); the link reads `door` off an answer.
 */
export type HomeBlockedReason = "name" | "trust" | "door"

/**
 * Which `HomeBlockedReason` an Android failure is, read from the
 * exception's class, which Capacitor's HTTP plugin rejects with as `code`
 * (`UnknownHostException`, `SSLPeerUnverifiedException`), and the
 * platform's own words, from `error` and its causes; null for any other
 * failure. Only certificate words say `trust`: a TLS connection dropped or
 * timed out (`SSL handshake aborted`, `SSL handshake timed out`) is no
 * answer. `online` is false when the phone is on no network at all, where
 * Android fails every name the same way: that is away, not `name`.
 */
export function blockedReason(
  error: unknown,
  online = true
): HomeBlockedReason | null {
  const words: Array<string> = []
  for (let at: unknown = error, depth = 0; at != null && depth < 4; depth++) {
    words.push(String(at))
    if (typeof at === "object") {
      if ("message" in at) words.push(String(at.message))
      if ("code" in at) words.push(String(at.code))
    }
    at = typeof at === "object" && "cause" in at ? at.cause : null
  }
  const said = words.join(" ")
  if (
    /CertPathValidator|Trust anchor|certificate|SSLPeerUnverified|not verified/i.test(
      said
    )
  ) {
    return "trust"
  }
  if (
    online &&
    /UnknownHost|Unable to resolve host|No address associated/i.test(said)
  ) {
    return "name"
  }
  return null
}

/** Whether the phone is on some network, as the WebView knows it. */
export const phoneOnline = (): boolean =>
  typeof navigator === "undefined" || navigator.onLine !== false

/**
 * A request to home that failed for a `HomeBlockedReason`: home was not
 * asked, so this is no answer from it, and not a fault on this phone.
 */
export class HomeBlockedError extends ForeignCallError {
  override name = "HomeBlockedError"

  constructor(
    error: IntentError,
    readonly reason: HomeBlockedReason
  ) {
    super(error)
  }
}
