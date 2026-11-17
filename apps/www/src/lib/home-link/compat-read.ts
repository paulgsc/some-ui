/**
 * Asks the paired home whether it serves this build of the app (#2843;
 * paulgsc/server `GET /compat?needs=<epoch>`, paulgsc/server#779): one
 * `GET` per ask, through the link's `look` (LA8), at home's own address and
 * without the credential, sending nothing of the phone's but the version it
 * was built against. What the answer means is `./serves-model`'s; only
 * `./serves` asks.
 */
import type { HomeAnswer } from "@some-ui/core-utils"

import { homeLink } from "./index"
import { answered } from "./while-busy"

/** The ask for a build made against server version `needs`. */
const compatPath = (needs: number): string => `/compat?needs=${String(needs)}`

/** Home's answer, or why there is none. */
export type CompatAsked =
  | { readonly kind: "answered"; readonly answer: HomeAnswer }
  /** Not paired: nothing was asked. */
  | { readonly kind: "unpaired" }
  /** The link let its turn go: ask again once it is free. */
  | { readonly kind: "busy" }
  /** No answer. */
  | { readonly kind: "unreachable" }

/** Asks home once; never rejects. */
export async function askCompat(needs: number): Promise<CompatAsked> {
  return answered(
    () => homeLink().look(compatPath(needs)),
    (answer): CompatAsked =>
      // Busy, or something between the phone and home answering for it:
      // nothing was said of this build.
      answer.status === 429 || answer.status >= 500
        ? { kind: "unreachable" }
        : { kind: "answered", answer }
  )
}
