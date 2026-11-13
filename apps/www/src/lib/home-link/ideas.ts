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
 * is now. Home's answers, as `./keyed-send` reads them for videos too:
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
import { isRecord, jsonOf } from "@some-ui/core-utils"
import type { IdeaForHome } from "@some-ui/soundbites"

import { ideaKeeping, ideaMoved } from "@/lib/idea-keeping"

import type { KeyedSend } from "./keyed-send"
import { sendKeyed, untakenTold } from "./keyed-send"
import type { Sent } from "./sent"
import { fingerprintOf, readSent, rememberSent } from "./sent"

/** How home answered for one idea, as `sent.ideas` remembers it. */
type Answered = "held" | "refused"

const entryOf = (answered: Answered, bundle: IdeaForHome): string =>
  `${answered} ${fingerprintOf(bundle)}`

/** The ideas home doesn't hold as they are now, and hasn't refused as they are. */
function ideasToSend(
  ideas: ReadonlyArray<IdeaForHome>,
  sent: Sent
): ReadonlyArray<IdeaForHome> {
  return ideas.filter(
    (bundle) =>
      sent.ideas[bundle.id] !== entryOf("held", bundle) &&
      sent.ideas[bundle.id] !== entryOf("refused", bundle)
  )
}

/** How many of `ideas` home answered `answered` for as they are now. */
function countAnswered(
  ideas: ReadonlyArray<IdeaForHome>,
  sent: Sent,
  answered: Answered
): number {
  return ideas.filter(
    (bundle) => sent.ideas[bundle.id] === entryOf(answered, bundle)
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

/** Home not taking an idea, said to the native log. */
const untaken = untakenTold("Studio ideas (send to home)", {
  unkept:
    "Home doesn't keep ideas yet, so they wait on this phone until it runs a newer version.",
  refused:
    "Home didn't take a Studio idea, so it stays on this phone and goes again once it changes.",
})

/** How an idea goes home, and where home's answer is kept (`./keyed-send`). */
function ideasSent(port: IdeasPort): KeyedSend<IdeaForHome> {
  return {
    what: "a Studio idea",
    path: (bundle) => ideaPath(bundle.id),
    body: (bundle) => JSON.stringify(bundle),
    kept: carriesBack,
    answered: (bundle, answer): void => {
      // Takes home lacks: the idea waits, and goes once its notes have.
      if (answer.kind !== "missing") port.answered(answer.kind, bundle)
    },
    untaken: (bundle, status): void => {
      untaken(bundle.id, status)
    },
  }
}

/** What a run needs: the ideas to send, and where to remember home's answers. */
export type IdeasPort = {
  readonly going: () => ReadonlyArray<IdeaForHome>
  readonly answered: (answered: Answered, bundle: IdeaForHome) => void
}

/** Sends each idea `port` names, oldest first, and says how the run ended. */
export const sendIdeas = (
  port: IdeasPort,
  send: HomeCall
): Promise<HomeExchanged> => sendKeyed(port.going(), ideasSent(port), send)

/**
 * The ideas handed in (`lib/idea-keeping`) as a run under `pairing` sends
 * them, remembering home's answers in `storage`; none until a route has
 * handed them in. Each answer is remembered onto the record as it stands
 * then, not as the run began: the drain writes the same record, and a
 * copy held across this run's requests would write its entries away.
 */
export function phoneIdeas(
  storage: KeyedStorage | null,
  pairing: string
): IdeasPort {
  return {
    going: () =>
      ideasToSend(ideaKeeping()?.forHome() ?? [], readSent(storage, pairing)),
    answered: (answered, bundle): void => {
      rememberSent(storage, readSent(storage, pairing), {
        ideas: { [bundle.id]: entryOf(answered, bundle) },
      })
      ideaMoved()
    },
  }
}

/**
 * The ideas home doesn't hold yet under `pairing`, holds, and refused as
 * they are now, for the lane's count.
 */
export function ideasWaiting(
  storage: KeyedStorage | null,
  pairing: string | null
): {
  readonly waiting: number
  readonly held: number
  readonly refused: number
} {
  const ideas = ideaKeeping()?.forHome() ?? []
  if (pairing === null) return { waiting: ideas.length, held: 0, refused: 0 }
  const sent = readSent(storage, pairing)
  return {
    waiting: ideasToSend(ideas, sent).length,
    held: countAnswered(ideas, sent, "held"),
    refused: countAnswered(ideas, sent, "refused"),
  }
}
