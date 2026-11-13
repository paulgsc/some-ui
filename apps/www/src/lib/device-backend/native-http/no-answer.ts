/**
 * A request to home that found no answer: the connection failed or timed
 * out (`classify`'s `unreachable` in `./index`). A `ForeignCallError`, so
 * `mapFileHostError` reads it as before; its own class, so the link can tell
 * home's silence from any other foreign failure on this phone (a Keystore
 * read, a plugin missing from the build). Apart from `./index`, so naming it
 * imports no request.
 */
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
