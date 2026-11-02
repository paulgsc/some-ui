/**
 * What home keeps of this phone's owner's recordings, for My data (MY-DATA
 * MD2, #2476; paulgsc/server `GET /voice-notes/kept`, `voice_repo::kept`):
 * one `GET` each time the page is opened or dragged down, through the
 * link's `keep` (LA8), sending nothing of the phone's but the kind asked
 * about. Home answers each kind's count, room, how many were set aside and
 * since when, what reached it each week, and with `of` that kind's newest:
 * descriptions only, never audio or what was said. What the page makes of
 * it is `lib/my-data`'s, its one reader.
 */
import type { HomeAnswer } from "@some-ui/core-utils"

import type { VoiceOut } from "@/lib/voice-home/model"

import { homeLink, paired } from "./index"

/** The read of what home keeps, with `of`'s newest when one is asked. */
export function keptPath(of: VoiceOut["of"] | null): string {
  return of === null
    ? "/voice-notes/kept"
    : `/voice-notes/kept?of=${encodeURIComponent(of)}`
}

/** Home's answer, or why there is none. */
export type KeptAsked =
  | { readonly kind: "answered"; readonly answer: HomeAnswer }
  /** Not paired: nothing was asked. */
  | { readonly kind: "unpaired" }
  /** The link was busy with another run, or the page went: ask again. */
  | { readonly kind: "busy" }
  /** No answer. */
  | { readonly kind: "unreachable" }

/** Asks home once what it keeps; never rejects. */
export async function askKept(of: VoiceOut["of"] | null): Promise<KeptAsked> {
  if (!paired()) return { kind: "unpaired" }
  try {
    const outcome = await homeLink().keep((send) => send("GET", keptPath(of)))
    return outcome?.kind === "done"
      ? { kind: "answered", answer: outcome.value }
      : { kind: "busy" }
  } catch {
    return { kind: "unreachable" }
  }
}
