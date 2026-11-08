/**
 * The notes left on the feeds' episodes, going home (SFEED6, #2745;
 * paulgsc/server `handlers::episode_notes`): each note kept on this phone
 * (`lib/episode-feedback`) goes home once, by one `PUT /feeds/:feed/notes/:id`
 * of the note as the phone keeps it, over the voice lane's `send`
 * (`./voice-copy`'s `sendVoice`), after the lane's notes have gone, so a
 * spoken note's take is on home first. This module makes no request of its
 * own, and lets nothing on the phone go: the note stays kept there.
 *
 * What home holds is remembered per pairing in `./sent` (`episodeNotes`). A
 * note never changes once kept, so its id is enough. Home's answers, as
 * `./keyed-send` reads them:
 *
 * - `200` carrying the note back, the same one: held;
 * - `409` (a different note under the same id) or `422`: refused, kept on
 *   the phone, and not offered again, said to the native log;
 * - `404`: a home that doesn't keep notes yet, so every note waits, said to
 *   the native log once a launch;
 * - `401`: home no longer knows this phone, and the run ends there;
 * - anything else ends the run, each note still waiting.
 */
import type { HomeCall, HomeExchanged, KeyedStorage } from "@some-ui/core-utils"
import { isRecord, jsonOf } from "@some-ui/core-utils"

import type { Note } from "@/lib/episode-feedback"
import { episodeFeedback } from "@/lib/episode-feedback"
import { movesSignal } from "@/lib/moves"

import type { KeyedSend } from "./keyed-send"
import { sendKeyed, untakenTold } from "./keyed-send"
import type { Sent } from "./sent"
import { readSent, rememberSent } from "./sent"

/** How home answered for one note, as `sent.episodeNotes` remembers it. */
type Answered = "held" | "refused"

const notesMoves = movesSignal()

/**
 * What moves when home comes to hold a note, or refuses one: the voice
 * lane's record and the Feedback page listen to it.
 */
export const episodeNotesMoved = notesMoves.moves

const notePath = (note: Note): string =>
  `/feeds/${note.feed}/notes/${encodeURIComponent(note.id)}`

/** Whether a `200`'s body carries back the note that was sent. */
function carriesBack(body: string, note: Note): boolean {
  const answer = jsonOf(body)
  if (!isRecord(answer) || !isRecord(answer.note)) return false
  const held = answer.note
  return (
    (answer.change === "added" || answer.change === "unchanged") &&
    held.id === note.id &&
    held.feed === note.feed &&
    held.episode === note.episode &&
    held.atMs === note.atMs &&
    Array.isArray(held.categories) &&
    held.categories.join() === note.categories.join() &&
    held.writtenAt === note.writtenAt
  )
}

/** Home not taking a note, said to the native log. */
const untaken = untakenTold("Episode notes (send to home)", {
  unkept:
    "Home doesn't keep notes on episodes yet, so they wait on this phone until it runs a newer version.",
  refused: "Home didn't take a note on an episode, so it stays on this phone.",
})

/** What a run needs: the notes to send, and where to remember home's answers. */
export type EpisodeNotesPort = {
  readonly going: () => ReadonlyArray<Note>
  readonly answered: (answered: Answered, note: Note) => void
}

/** How a note goes home, and where home's answer is kept (`./keyed-send`). */
const notesSent = (port: EpisodeNotesPort): KeyedSend<Note> => ({
  what: "a note on an episode",
  path: notePath,
  body: (note) => JSON.stringify(note),
  kept: carriesBack,
  answered: (note, answer): void => {
    // Home names no takes for a note: a take it lacks is a refusal too.
    port.answered(answer.kind === "held" ? "held" : "refused", note)
  },
  untaken: (note, status): void => {
    untaken(note.id, status)
  },
})

/** Sends each note `port` names, oldest first, and says how the run ended. */
export const sendEpisodeNotes = (
  port: EpisodeNotesPort,
  send: HomeCall
): Promise<HomeExchanged> => sendKeyed(port.going(), notesSent(port), send)

/** The kept notes home has answered for under `pairing` neither way yet. */
const unanswered = (sent: Sent): ReadonlyArray<Note> =>
  episodeFeedback
    .getSnapshot()
    .filter((note) => !(note.id in sent.episodeNotes))

/**
 * The notes kept on this phone as a run under `pairing` sends them,
 * remembering home's answers in `storage`. Each answer is remembered onto
 * the record as it stands then, since the drain writes the same record.
 */
export function phoneEpisodeNotes(
  storage: KeyedStorage | null,
  pairing: string
): EpisodeNotesPort {
  return {
    going: () => unanswered(readSent(storage, pairing)),
    answered: (answered, note): void => {
      rememberSent(storage, readSent(storage, pairing), {
        episodeNotes: { [note.id]: answered },
      })
      notesMoves.moved()
    },
  }
}

/**
 * The notes home doesn't hold yet under `pairing`, holds, and refused, for
 * the lane's count and the Feedback page.
 */
export function episodeNotesWaiting(
  storage: KeyedStorage | null,
  pairing: string | null
): {
  readonly waiting: number
  readonly held: ReadonlySet<string>
  readonly refused: ReadonlySet<string>
} {
  const notes = episodeFeedback.getSnapshot()
  if (pairing === null)
    return { waiting: notes.length, held: new Set(), refused: new Set() }
  const sent = readSent(storage, pairing).episodeNotes
  const ids = (answered: Answered): ReadonlySet<string> =>
    new Set(notes.filter((n) => sent[n.id] === answered).map((n) => n.id))
  return {
    waiting: notes.filter((note) => !(note.id in sent)).length,
    held: ids("held"),
    refused: ids("refused"),
  }
}
