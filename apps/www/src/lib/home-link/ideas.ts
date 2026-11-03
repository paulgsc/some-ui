/**
 * Studio's ideas on home (ST26 (b), #2453; paulgsc/server `handlers::ideas`):
 * each idea sent whole on this phone goes home as one bundle, by one
 * `PUT /ideas/:id` of what `@some-ui/soundbites`' `ideasForHome` makes of
 * it, over the voice lane's `send` (`./voice-copy`'s `sendVoice`), after the
 * lane's notes have gone: a said answer names its take's voice note by id,
 * which home must hold first. This module makes no request of its own, and
 * lets nothing on the phone go: the idea stays kept there whole (LA15).
 *
 * What home holds is remembered per pairing in `./sent` (`ideas`), as each
 * bundle's fingerprint, so a run sends only an idea home doesn't hold as it
 * is now. Home's answers:
 *
 * - `200` carrying the idea back, the same one: held;
 * - `409` naming notes: a take home doesn't hold yet, so the idea waits on
 *   the phone and goes on a later run, once its notes have;
 * - `409` with no notes (a different bundle under a time home holds, or an
 *   idea set aside on home) or a `422`: refused, kept on the phone, and not
 *   offered again until it changes, said to the native log;
 * - `404`: a home that doesn't keep ideas yet, so every idea waits, said to
 *   the native log once a launch;
 * - `401`: home no longer knows this phone, and the run ends there;
 * - anything else ends the run, each idea still waiting.
 */
import type { HomeCall, HomeExchanged, KeyedStorage } from "@some-ui/core-utils"
import { isRecord, jsonOf, unexpectedAnswer } from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import type { IdeaForHome } from "@some-ui/soundbites"

import { ideaKeeping, ideaMoved } from "@/lib/idea-keeping"

import type { Sent } from "./sent"
import { fingerprintOf, readSent, rememberSent } from "./sent"

/** How home answered for one idea, as `sent.ideas` remembers it. */
type Answered = "held" | "refused"

const entryOf = (answered: Answered, bundle: IdeaForHome): string =>
  `${answered} ${fingerprintOf(bundle)}`

/** The ideas home doesn't hold as they are now, and hasn't refused as they are. */
export function ideasToSend(
  ideas: ReadonlyArray<IdeaForHome>,
  sent: Sent
): ReadonlyArray<IdeaForHome> {
  return ideas.filter(
    (bundle) =>
      sent.ideas[bundle.id] !== entryOf("held", bundle) &&
      sent.ideas[bundle.id] !== entryOf("refused", bundle)
  )
}

/** How many of `ideas` home holds as they are now. */
export function ideasHeld(
  ideas: ReadonlyArray<IdeaForHome>,
  sent: Sent
): number {
  return ideas.filter(
    (bundle) => sent.ideas[bundle.id] === entryOf("held", bundle)
  ).length
}

const ideaPath = (id: string): string => `/ideas/${encodeURIComponent(id)}`

/** Whether a `200`'s body carries back the idea that was sent. */
function carriesBack(body: string, bundle: IdeaForHome): boolean {
  const answer = jsonOf(body)
  if (!isRecord(answer) || !isRecord(answer.idea)) return false
  const { idea } = answer
  return (
    (answer.change === "added" || answer.change === "unchanged") &&
    idea.id === bundle.id &&
    idea.createdAt === bundle.createdAt &&
    idea.title === bundle.title &&
    idea.topic === bundle.topic &&
    idea.format === bundle.format
  )
}

/** Whether a `409`'s body names notes home doesn't hold. */
function namesNotes(body: string): boolean {
  const answer = jsonOf(body)
  if (!isRecord(answer) || !isRecord(answer.error)) return false
  const { details } = answer.error
  return isRecord(details) && Array.isArray(details.notes)
}

/** Whether this launch has told the native log home keeps no ideas. */
let unkeptSaid = false

function untaken(bundle: IdeaForHome, status: number): void {
  if (status === 404) {
    if (unkeptSaid) return
    unkeptSaid = true
  }
  reportFailure({
    port: "Studio ideas (send to home)",
    error: {
      ...toIntentError(
        new Error(`${bundle.id}: home answered ${String(status)}`)
      ),
      summary:
        status === 404
          ? "Home doesn't keep ideas yet, so they wait on this phone until it runs a newer version."
          : "Home didn't take a Studio idea, so it stays on this phone and goes again once it changes.",
    },
  })
}

/** What a run needs: the ideas to send, and where to remember home's answers. */
export type IdeasPort = {
  readonly going: () => ReadonlyArray<IdeaForHome>
  readonly answered: (answered: Answered, bundle: IdeaForHome) => void
}

/** Sends each idea `port` names, oldest first, and says how the run ended. */
export async function sendIdeas(
  port: IdeasPort,
  send: HomeCall
): Promise<HomeExchanged> {
  for (const bundle of port.going()) {
    const answer = await send(
      "PUT",
      ideaPath(bundle.id),
      JSON.stringify(bundle)
    )
    if (answer.status === 200 && carriesBack(answer.body, bundle)) {
      port.answered("held", bundle)
      continue
    }
    if (answer.status === 401) return { kind: "forgotten" }
    if (answer.status === 409 && namesNotes(answer.body)) continue
    if (answer.status === 409 || answer.status === 422) {
      port.answered("refused", bundle)
      untaken(bundle, answer.status)
      continue
    }
    if (answer.status === 404) {
      untaken(bundle, answer.status)
      return { kind: "synced" }
    }
    return unexpectedAnswer("a Studio idea", answer.status)
  }
  return { kind: "synced" }
}

/**
 * The ideas handed in (`lib/idea-keeping`) as a run under `pairing` sends
 * them, remembering home's answers in `storage`; none until a route has
 * handed them in.
 */
export function phoneIdeas(
  storage: KeyedStorage | null,
  pairing: string
): IdeasPort {
  let sent = readSent(storage, pairing)
  return {
    going: () => ideasToSend(ideaKeeping()?.forHome() ?? [], sent),
    answered: (answered, bundle): void => {
      sent = rememberSent(storage, sent, {
        ideas: { [bundle.id]: entryOf(answered, bundle) },
      })
      ideaMoved()
    },
  }
}

/** The ideas home doesn't hold yet under `pairing`, for the lane's count. */
export function ideasWaiting(
  storage: KeyedStorage | null,
  pairing: string | null
): { readonly waiting: number; readonly held: number } {
  const ideas = ideaKeeping()?.forHome() ?? []
  if (pairing === null) return { waiting: ideas.length, held: 0 }
  const sent = readSent(storage, pairing)
  return {
    waiting: ideasToSend(ideas, sent).length,
    held: ideasHeld(ideas, sent),
  }
}
