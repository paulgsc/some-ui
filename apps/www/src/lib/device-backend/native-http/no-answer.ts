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
