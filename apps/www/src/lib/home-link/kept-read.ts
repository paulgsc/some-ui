/**
 * What home keeps of this phone's owner's recordings, for My data (MY-DATA
 * MD2, #2476; paulgsc/server `GET /voice-notes/kept`, `voice_repo::kept`):
 * one `GET` each time the page is opened or dragged down, through the
 * link's `keep` (LA8), sending nothing of the phone's but the kind asked
 * about. Home answers each kind's count, room, how many were set aside and
 * since when, what reached it each week, and with `of` that kind's newest:
 * descriptions only, never audio or what was said. On the overview the
 * same run also asks how much home keeps for good of the record
 * (paulgsc/server `GET /subjects/me/kept`, `storage_repo::kept`; MD2b,
 * #2519): per kind, how many and since when, sending nothing. What the page
 * makes of both is `lib/my-data`'s, their one reader.
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
  | {
      readonly kind: "answered"
      readonly answer: HomeAnswer
      /** Home's count of the record, asked on the overview alone. */
      readonly record: HomeAnswer | null
    }
  /** Not paired: nothing was asked. */
  | { readonly kind: "unpaired" }
  /** The link was busy with another run, or the page went: ask again. */
  | { readonly kind: "busy" }
  /** No answer. */
  | { readonly kind: "unreachable" }

/** Asks home once what it keeps, in one run of the link; never rejects. */
export async function askKept(of: VoiceOut["of"] | null): Promise<KeptAsked> {
  if (!paired()) return { kind: "unpaired" }
  try {
    const outcome = await homeLink().keep(async (send) => ({
      answer: await send("GET", keptPath(of)),
      record: of === null ? await send("GET", "/subjects/me/kept") : null,
    }))
    return outcome?.kind === "done"
      ? { kind: "answered", ...outcome.value }
      : { kind: "busy" }
  } catch {
    return { kind: "unreachable" }
  }
}
