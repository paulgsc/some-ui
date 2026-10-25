/**
 * Which voice notes go home and what each is told home as (LA13), and the
 * copying of each for home while its person keeps voice notes there
 * (`lib/voice-home`): outside React, so `./voice`'s hook only starts and
 * stops it.
 *
 * - a reflection said aloud (`lib/reflection-voice`): `reflection`, its
 *   session, when it was said;
 * - a Jobs voice note (`lib/jobs`), once an event names it: `jobs`, the
 *   pick (`<day>:<pick>`) or scout, when that event was made;
 * - the drama's next scene said aloud (`lib/scene-voice`), when its prompt
 *   is shared (`onPromptShared`): `scene`, the prompt's stamp, when the
 *   prompt was made.
 *
 * Copying deletes nothing where the note was recorded; letting it go there
 * leaves the copy, which goes once home holds the note.
 */
import { assertNever } from "@some-ui/core-utils"

import { jobVoiceAudio, phoneJobs } from "@/lib/jobs"
import type { JobEvent, VoiceNote } from "@/lib/jobs/model"
import {
  isSaving,
  onAudioSettled,
  reflectionAudio,
} from "@/lib/reflection-voice"
import type { SharedPrompt } from "@/lib/scene-voice"
import { onPromptShared } from "@/lib/scene-voice"
import { reflections } from "@/lib/session-reflection"
import type { Reflection } from "@/lib/session-reflection/policy"
import { phoneVoiceHome } from "@/lib/voice-home"
import type { VoiceOut } from "@/lib/voice-home/model"

import { phoneConsent } from "./consent-runtime"
import { homeLink } from "./index"
import { keptNow } from "./lanes"

/** What the voice lane keeps sending (`./voice`). */
export const VOICE_SCOPES = { scopes: ["voice"] } as const

/** A finished voice reflection, as home is told it; null for any other. */
export function reflectionNote(reflection: Reflection): VoiceOut | null {
  const { body } = reflection
  if (body.kind !== "voice") return null
  return {
    id: reflection.id,
    of: "reflection",
    ref: reflection.sessionId,
    at: reflection.createdAt,
    contentType: body.mimeType,
  }
}

/** What a Jobs event's voice notes belong to; null for an event that names none of its own. */
function jobsRef(event: JobEvent): string | null {
  switch (event.type) {
    case "passed":
    case "fit-note":
    case "debrief": {
      return `${event.day}:${event.pickId}`
    }
    case "scout": {
      return event.scout.id
    }
    case "taken":
    case "archived":
    case "resume-ready":
    case "apply-opened":
    case "read":
    case "outcome":
    case "disagree":
    case "shared":
    case "arrived": {
      // A share names notes other events named first.
      return null
    }
    default: {
      return assertNever(event)
    }
  }
}

/**
 * Each voice note the Jobs record names, as home is told it, by the first
 * event that names it; a note whose entry is gone (let go) is left out.
 */
export function jobsNotes(
  log: ReadonlyArray<JobEvent>,
  voice: ReadonlyArray<VoiceNote>
): Array<VoiceOut> {
  const types = new Map(voice.map((note) => [note.id, note.mimeType]))
  const notes = new Map<string, VoiceOut>()
  for (const event of log) {
    const ref = jobsRef(event)
    if (ref === null || !("voice" in event)) continue
    for (const id of event.voice) {
      const contentType = types.get(id)
      if (contentType === undefined || notes.has(id)) continue
      notes.set(id, { id, of: "jobs", ref, at: event.at, contentType })
    }
  }
  return [...notes.values()]
}

/** One note on this phone that could go home, and where its audio is. */
type Candidate = {
  readonly note: VoiceOut
  readonly audio: () => Promise<Blob | null>
}

export function candidates(): Array<Candidate> {
  const said = reflections
    .getSnapshot()
    .kept.filter((reflection) => !isSaving(reflection.id))
    .flatMap((reflection) => {
      const note = reflectionNote(reflection)
      return note === null
        ? []
        : [
            {
              note,
              audio: (): Promise<Blob | null> => reflectionAudio().get(note.id),
            },
          ]
    })
  const { log, voice } = phoneJobs().getSnapshot().state
  const named = jobsNotes(log, voice).map((note) => ({
    note,
    audio: (): Promise<Blob | null> => jobVoiceAudio().get(note.id),
  }))
  return [...said, ...named]
}

/** Copies each note not yet copied, held or refused, while voice notes are kept on home. */
async function copyAll(): Promise<void> {
  const home = phoneVoiceHome()
  for (const { note, audio } of candidates()) {
    if (!keptNow(VOICE_SCOPES)) return
    if (home.settled(note.id)) continue
    const blob = await audio()
    // A stop can land while the audio is read.
    if (blob !== null && keptNow(VOICE_SCOPES)) await home.copy(note, blob)
  }
}

let copying: Promise<void> | null = null
let again = false

/** One copy pass at a time; a change during one asks for one more after it. */
function copySoon(): void {
  if (!keptNow(VOICE_SCOPES)) return
  if (copying !== null) {
    again = true
    return
  }
  copying = copyAll()
    .catch(() => undefined)
    .finally(() => {
      copying = null
      if (again) {
        again = false
        copySoon()
      }
    })
}

/**
 * A drama prompt was shared with these notes: each is copied for home under
 * the prompt's stamp, while voice notes are kept on home. Best effort, and
 * nothing waits on it.
 */
function copySceneNotes({ stamp, at, notes }: SharedPrompt): void {
  if (!keptNow(VOICE_SCOPES)) return
  const home = phoneVoiceHome()
  for (const { id, mimeType, audio } of notes) {
    home
      .copy({ id, of: "scene", ref: stamp, at, contentType: mimeType }, audio)
      .catch(() => undefined)
  }
}

/**
 * Copies each new note while voice notes are kept on home, until stopped.
 * The stores that hold notes are listened to only once voice notes are
 * kept, so a phone that never chose it builds none of them for this.
 */
export function watchVoiceNotes(): () => void {
  const stores: Array<() => void> = []
  const changed = (): void => {
    if (keptNow(VOICE_SCOPES) && stores.length === 0) {
      stores.push(
        reflections.subscribe(copySoon),
        // A spoken reflection is listed before its audio is written.
        onAudioSettled(copySoon),
        phoneJobs().subscribe(copySoon)
      )
    }
    copySoon()
  }
  changed()
  const stops = [
    onPromptShared(copySceneNotes),
    phoneConsent().subscribe(changed),
    homeLink().subscribe(changed),
  ]
  return (): void => {
    for (const stop of [...stops, ...stores]) stop()
  }
}
