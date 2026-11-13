/**
 * What home keeps of this phone's owner's recordings, for My data (MY-DATA
 * MD2, #2476; paulgsc/server `GET /voice-notes/kept`, `voice_repo::kept`):
 * one `GET` each time the page is opened or dragged down, through the
 * link's `keep` (LA8), sending nothing of the phone's but the kind asked
 * about. Home answers each kind's count, room, how many were set aside and
 * since when, what reached it each week, and with `of` that kind's newest,
 * each with how long it is and the first words home heard in it, once heard
 * (MD8): never audio, which a Play asks for (`./voice-audio`). On the overview the
 * same run also asks how much home keeps for good of the record
 * (paulgsc/server `GET /subjects/me/kept`, `storage_repo::kept`; MD2b,
 * #2519): per kind, how many and since when, sending nothing. What the page
 * makes of both is `lib/my-data`'s, their one reader.
 */
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import type { VoiceOut } from "@/lib/voice-home/model"

import { homeLink, paired } from "./index"

/**
 * The read of what home keeps, with `of`'s newest when one is asked, and
 * the recording `note` names among them when it is older.
 */
export function keptPath(
  of: VoiceOut["of"] | null,
  note: string | null = null
): string {
  if (of === null) return "/voice-notes/kept"
  const kind = `/voice-notes/kept?of=${encodeURIComponent(of)}`
  return note === null ? kind : `${kind}&note=${encodeURIComponent(note)}`
}

/** Home's answer, or why there is none. */
export type KeptAsked =
  | {
      readonly kind: "answered"
      readonly answer: HomeAnswer
      /**
       * Home's count of the record, asked on the overview alone;
       * `unanswered` when that request got no answer.
       */
      readonly record: HomeAnswer | "unanswered" | null
    }
  /** Not paired: nothing was asked. */
  | { readonly kind: "unpaired" }
  /** The link was busy with another run, or the page went: ask again. */
  | { readonly kind: "busy" }
  /** No answer. */
  | { readonly kind: "unreachable" }

/** Asks home once what it keeps, in one run of the link; never rejects. */
export async function askKept(
  of: VoiceOut["of"] | null,
  note: string | null = null
): Promise<KeptAsked> {
  if (!paired()) return { kind: "unpaired" }
  try {
    const outcome = await homeLink().keep(async (send) => ({
      answer: await send("GET", keptPath(of, note)),
      record: of === null ? await askRecord(send) : null,
    }))
    return outcome?.kind === "done"
      ? { kind: "answered", ...outcome.value }
      : { kind: "busy" }
  } catch {
    return { kind: "unreachable" }
  }
}

/** The record's count, whose failure leaves the recordings' answer standing. */
async function askRecord(send: HomeCall): Promise<HomeAnswer | "unanswered"> {
  try {
    return await send("GET", "/subjects/me/kept")
  } catch (error) {
    if (error instanceof SyncStoppedError) throw error
    return "unanswered"
  }
}
