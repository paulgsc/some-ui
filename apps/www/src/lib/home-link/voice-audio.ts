/**
 * A note's audio back from home (paulgsc/server `GET /voice-notes/:id/audio`),
 * one `GET` per play, through the link's `keep` (LA8); it sends nothing of
 * the phone's but the note's id, and keeps nothing it gets. Two callers:
 *
 * - a Rust Rounds note (RR6 #2237, the owner's D4: home gives a note's audio
 *   back to the phone, for refine cards and replay), asked for by the voice
 *   lane's desk (`./voice-copy`) when a note plays whose audio is not on this
 *   phone, because it left once home held it or because a refine card
 *   brings back a note this phone never held;
 * - a Studio take (ST32), asked for by Takes on home (`lib/take-library`)
 *   on each Play.
 *
 * What home answers:
 *
 * - `200` `{ "id", "contentType", "sha256", "audio" }`: the note's bytes as
 *   base64, played only when their SHA-256 is the one home names, so bytes
 *   that changed on the way never play as the note;
 * - anything else (`404` for a note home doesn't hold, or holds of a kind it
 *   gives no audio back for; a body that doesn't read; bytes whose hash
 *   differs), a link busy with another run, an unpaired phone or no answer:
 *   none, and the note can't play now, which the screen says.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { readAs, sha256Hex } from "@some-ui/core-utils"
import { z } from "zod"

import { homeLink, paired } from "./index"

const NoteAudio = z.object({
  id: z.string(),
  contentType: z.string(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  audio: z.string(),
})

/** The read of note `id`'s audio, as home takes it. */
export function audioPath(id: string): string {
  return `/voice-notes/${encodeURIComponent(id)}/audio`
}

/** A note's audio as home said it: its container, bytes and their hash. */
export type HomeAudio = {
  readonly contentType: string
  readonly bytes: Uint8Array<ArrayBuffer>
  readonly sha256: string
}

/** What home's answer gives of note `id`'s audio; null for none. */
export function readAudio(answer: HomeAnswer, id: string): HomeAudio | null {
  if (answer.status !== 200) return null
  const read = readAs(NoteAudio, answer.body)
  if (read?.id !== id) return null
  let binary: string
  try {
    binary = atob(read.audio)
  } catch {
    return null
  }
  const bytes = new Uint8Array(binary.length)
  for (let at = 0; at < binary.length; at += 1) {
    bytes[at] = binary.charCodeAt(at)
  }
  return { contentType: read.contentType, bytes, sha256: read.sha256 }
}

/** `audio` as something to play, once its bytes hash to home's SHA-256. */
async function checkedAudio(audio: HomeAudio): Promise<Blob | null> {
  const hash = await sha256Hex(audio.bytes.buffer)
  return hash === audio.sha256
    ? new Blob([audio.bytes], { type: audio.contentType })
    : null
}

/** Note `id`'s audio from home, asked once; never rejects. */
export async function askAudio(id: string): Promise<Blob | null> {
  if (!paired()) return null
  try {
    const outcome = await homeLink().keep((send) => send("GET", audioPath(id)))
    if (outcome?.kind !== "done") return null
    const audio = readAudio(outcome.value, id)
    return audio === null ? null : await checkedAudio(audio)
  } catch {
    return null
  }
}
