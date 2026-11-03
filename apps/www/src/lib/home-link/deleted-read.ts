/**
 * The receipts home keeps of what My data deleted for good (MY-DATA MD3,
 * #2477; paulgsc/server `GET /voice-notes/deleted`, paulgsc/server#667):
 * one `GET` each time My data's Deleted page opens or is dragged down,
 * through the link's `keep` (LA8), sending nothing of the phone's. Home
 * answers each receipt as its delete did: what kind, when recorded and
 * deleted, its size, and what went and what stayed, in fixed words; never
 * what was said. What the page makes of it is `lib/my-data`'s, its one
 * reader.
 */
import type { HomeAnswer } from "@some-ui/core-utils"

import { homeLink, paired } from "./index"

/** The read of the receipts. */
const DELETED_PATH = "/voice-notes/deleted"

/** Home's answer, or why there is none. */
export type DeletedAsked =
  | { readonly kind: "answered"; readonly answer: HomeAnswer }
  /** Not paired: nothing was asked. */
  | { readonly kind: "unpaired" }
  /** The link was busy with another run, or the page went: ask again. */
  | { readonly kind: "busy" }
  /** No answer. */
  | { readonly kind: "unreachable" }

/** Asks home once for its receipts; never rejects. */
export async function askDeleted(): Promise<DeletedAsked> {
  if (!paired()) return { kind: "unpaired" }
  try {
    const outcome = await homeLink().keep((send) => send("GET", DELETED_PATH))
    return outcome?.kind === "done"
      ? { kind: "answered", answer: outcome.value }
      : { kind: "busy" }
  } catch {
    return { kind: "unreachable" }
  }
}
