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
 * it doesn't trust home's certificate. Neither is home's silence, so
 * neither is away (AW1).
 */
export type HomeBlockedReason = "name" | "trust"

/**
 * Which `HomeBlockedReason` an Android failure is, read from the
 * platform's own words (`UnknownHostException`, `SSLHandshakeException`
 * and the like), from `error` and its cause; null for any other failure.
 */
export function blockedReason(error: unknown): HomeBlockedReason | null {
  const words: Array<string> = []
  for (let at: unknown = error, depth = 0; at != null && depth < 4; depth++) {
    words.push(String(at))
    if (typeof at === "object" && "message" in at)
      words.push(String(at.message))
    at = typeof at === "object" && "cause" in at ? at.cause : null
  }
  const said = words.join(" ")
  if (/SSL|certif|CertPath|trust anchor/i.test(said)) return "trust"
  if (/UnknownHost|Unable to resolve host|No address associated/i.test(said)) {
    return "name"
  }
  return null
}

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
