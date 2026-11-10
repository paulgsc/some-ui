/**
 * Asks the paired home whether it serves this build of the app (#2843;
 * paulgsc/server `GET /compat?needs=<epoch>`, paulgsc/server#779): one
 * `GET` per ask, through the link's `look` (LA8), at home's own address and
 * without the credential, sending nothing of the phone's but the version it
 * was built against. What the answer means is `./serves-model`'s; only
 * `./serves` asks.
 */
import type { HomeAnswer } from "@some-ui/core-utils"

import { homeLink, paired } from "./index"

/** The ask for a build made against server version `needs`. */
const compatPath = (needs: number): string =>
  `/compat?needs=${String(needs)}`

/** Home's answer, or why there is none. */
export type CompatAsked =
  | { readonly kind: "answered"; readonly answer: HomeAnswer }
  /** Not paired: nothing was asked. */
  | { readonly kind: "unpaired" }
  /** The link was busy with another read, or the app went to the background. */
  | { readonly kind: "busy" }
  /** No answer. */
  | { readonly kind: "unreachable" }

/** Asks home once; never rejects. */
export async function askCompat(needs: number): Promise<CompatAsked> {
  if (!paired()) return { kind: "unpaired" }
  try {
    const outcome = await homeLink().look(compatPath(needs))
    return outcome?.kind === "done"
      ? { kind: "answered", answer: outcome.value }
      : { kind: "busy" }
  } catch {
    return { kind: "unreachable" }
  }
}
