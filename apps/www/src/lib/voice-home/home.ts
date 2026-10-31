/**
 * One exchange with home for the voice notes waiting to go (LA13): each
 * note copied for home, oldest first, as its own request
 * (`PUT /voice-notes/:id?of=&ref=&at=`, the audio as the body; paulgsc/server
 * `handlers::voice`). Over a `send` port the home link hands in
 * (`lib/home-link/voice`), so this module makes no request of its own.
 *
 * Home answers with the note it holds and its SHA-256; a note counts as
 * home's only once that hash is the phone's. A replay is answered
 * `unchanged`, so a note sent twice leaves one note on home. A `409` (other
 * audio under that id) or a `422` naming the note's fields is a refusal,
 * kept and never sent again. A `422` naming only the body means the bytes
 * did not arrive (Android 7's native request sends none): not the note's
 * fault, so it ends the exchange and the note waits.
 */
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { readAs, refusalOf, unexpectedAnswer } from "@some-ui/core-utils"
import { z } from "zod"

import type { VoiceHomeEvent, VoiceHomeState, VoiceOut } from "./model"

/** Home's ceiling for one note (`voice_repo::NOTE_CEILING`). */
export const NOTE_CEILING = 1024 * 1024

/** A note's audio as a request carries it, with the hash home should answer. */
export type Encoded = { readonly base64: string; readonly sha256: string }

export type VoiceHomePort = {
  state: () => VoiceHomeState
  /** The copy's audio, or null if it is gone from this phone. */
  audio: (id: string) => Promise<Blob | null>
  encode: (blob: Blob) => Promise<Encoded>
  /** What home said of a note: held, or refused for good. */
  answered: (
    event: Extract<VoiceHomeEvent, { kind: "held" | "refused" }>
  ) => void
}

const NoteAnswer = z.object({
  note: z.object({ id: z.string(), sha256: z.string() }),
})

const Refused = z.object({
  error: z.object({ details: z.record(z.string(), z.unknown()) }),
})

/** A `422` that names only the body: the bytes did not arrive. */
function bodyOnly(body: string): boolean {
  const details = readAs(Refused, body)?.error.details
  return details !== undefined && Object.keys(details).join() === "body"
}

function pathOf(note: VoiceOut): string {
  const query = new URLSearchParams({ of: note.of, ref: note.ref, at: note.at })
  // A game bite's fields (`VoiceOut.fields`), which never name these three.
  for (const [name, value] of Object.entries(note.fields ?? {})) {
    if (!query.has(name)) query.set(name, value)
  }
  return `/voice-notes/${encodeURIComponent(note.id)}?${query.toString()}`
}

export async function exchangeVoice(
  port: VoiceHomePort,
  send: HomeCall
): Promise<HomeExchanged> {
  for (const note of port.state().waiting) {
    const blob = await port.audio(note.id)
    if (blob === null) {
      port.answered({
        kind: "refused",
        id: note.id,
        why: "its recording is gone from this phone",
      })
      continue
    }
    if (blob.size > NOTE_CEILING) {
      port.answered({
        kind: "refused",
        id: note.id,
        why: "longer than home keeps",
      })
      continue
    }
    const { base64, sha256 } = await port.encode(blob)
    const answer = await send("PUT", pathOf(note), {
      contentType: note.contentType,
      base64,
    })
    if (answer.status === 401) return { kind: "forgotten" }
    if (answer.status === 409) {
      port.answered({
        kind: "refused",
        id: note.id,
        why: "home holds another recording under its name",
      })
      continue
    }
    if (answer.status === 422) {
      if (bodyOnly(answer.body)) return unexpectedAnswer("a voice note", 422)
      port.answered({
        kind: "refused",
        id: note.id,
        why: refusalOf(answer.body),
      })
      continue
    }
    const held = readAs(NoteAnswer, answer.body)?.note ?? null
    if (answer.status !== 200 || held?.id !== note.id) {
      return unexpectedAnswer("a voice note", answer.status)
    }
    if (held.sha256 !== sha256) {
      return unexpectedAnswer("a voice note", answer.status)
    }
    port.answered({ kind: "held", id: note.id })
  }
  return { kind: "synced" }
}
