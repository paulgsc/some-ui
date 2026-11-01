/**
 * Home's mark on a voice note the owner let go on the phone (D3 on epic
 * #2368, MIC2 #2372): `PUT /voice-notes/:id/set-aside?at=` (paulgsc/server
 * `handlers::voice::put_set_aside`, `voice_repo::set_aside`), so the
 * transcriber's queue, the transcripts filed for the mailbox and the
 * reflections index skip the note from then on. Home keeps the note, its
 * audio and any transcript; a Jobs note is still heard and filed. There is
 * no route that un-sets a mark, and the phone has no undo for Let go.
 *
 * One `PUT` per mark due (`marksDue`: owed, for a note home holds), over the
 * voice lane's `send` (`./voice-copy`'s `sendVoice`), with no body, so this
 * module makes no request of its own and sends nothing of the phone's but
 * the note's id and when it was let go. Home's answers:
 *
 * - `204`, marked or already marked (the first time stands): answered;
 * - `404`, home holds no such note for this phone's account: still owed,
 *   and asked again on the next run;
 * - `422` naming `at`, a time home can't read: answered for good, since no
 *   later run could send another, and said to the native log;
 * - `401`: home no longer knows this phone, and the run ends there;
 * - anything else ends the run, the mark still owed.
 *
 * A request that fails on the way (no answer) throws, as the lane's other
 * requests do, and the mark stays owed for the next run.
 */
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { unexpectedAnswer } from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"

import type { AsideMark, AsidePort } from "@/lib/voice-home/model"

/** The mark's request, as home takes it: the note's id, and `at` in the query. */
export function setAsidePath(mark: AsideMark): string {
  const query = new URLSearchParams({ at: mark.at })
  return `/voice-notes/${encodeURIComponent(mark.id)}/set-aside?${query.toString()}`
}

/** A mark home did not take, to the native log. */
function untaken(mark: AsideMark, status: number): void {
  reportFailure({
    port: "voice notes (set aside on home)",
    error: {
      ...toIntentError(
        new Error(`${mark.id}: home answered ${String(status)}`)
      ),
      summary:
        status === 404
          ? "Home didn't find a voice note set aside on this phone, so it is asked again next time."
          : "Home couldn't read when a voice note was set aside, so it isn't marked set aside there.",
    },
  })
}

/** Sends each mark due, oldest first, and says how the exchange ended. */
export async function markSetAside(
  port: AsidePort,
  send: HomeCall
): Promise<HomeExchanged> {
  for (const mark of port.due()) {
    const answer = await send("PUT", setAsidePath(mark))
    if (answer.status === 204) {
      port.answered("marked", mark.id)
      continue
    }
    if (answer.status === 401) return { kind: "forgotten" }
    if (answer.status === 404 || answer.status === 422) {
      if (answer.status === 422) port.answered("unmarkable", mark.id)
      untaken(mark, answer.status)
      continue
    }
    return unexpectedAnswer("a set-aside mark", answer.status)
  }
  return { kind: "synced" }
}
