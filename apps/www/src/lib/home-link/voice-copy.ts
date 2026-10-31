/**
 * Which voice notes go home and what each is told home as (LA13), and the
 * copying of each for home while the phone is paired (`lib/voice-home`):
 * outside React, so `./voice`'s hook only starts and stops it.
 *
 * - a reflection said aloud (`lib/reflection-voice`): `reflection`, its
 *   session, when it was said;
 * - a Jobs voice note (`lib/jobs`), once an event names it: `jobs`, the
 *   pick (`<day>:<pick>`) or scout, when that event was made;
 * - the drama's next scene said aloud (`lib/scene-voice`), when its prompt
 *   is shared (`onPromptShared`): `scene`, the prompt's stamp, when the
 *   prompt was made;
 * - a game bite (`lib/game-bites`), once Undo and the question of what it
 *   was about are closed: `game`, the game's ESPN id, when it was kept, and
 *   every field it keeps;
 * - a Studio take still on the phone (`@some-ui/soundbites`' `notesForHome`,
 *   handed in by Studio's route, `lib/studio-keeping`): `studio`, the take as
 *   `<project>:<shot>:<take>`, when it was recorded.
 *
 * Copying deletes nothing where the note was recorded; letting it go there
 * leaves the copy, which goes once home holds the note. Each pass says what
 * it could not copy and why (`copyPasses`), so Settings never counts as
 * waiting a note this phone cannot send (LA14).
 *
 * **LG1: nothing is let go on a third party's word** (HF1, #2176; the
 * owner's frame, `docs/learner-data-authority.md`, "The owner's deployment").
 *
 * - _Claim:_ no share-sheet confirmation ("Did they arrive?", "They're in
 *   Drive") removes an item from the phone; an item's audio or record leaves
 *   only once home has read it back (`held`, `letGoHeldBites`), and a Drive
 *   copy is only ever a copy.
 * - _Family:_ every share kind (a Jobs decisions or scouts file with its
 *   voice notes; reflections; the study-context export with its soundbites,
 *   grammar-lens entries and takes, and LeetType answers and takes; a drama
 *   prompt with its scene notes; Studio takes) × every home state (held;
 *   waiting; unpaired; off the LAN, which the phone sees alike as not held).
 * - _Proof:_ `lib/jobs/__tests__/runtime.test.ts` ("LG1": a share arriving
 *   keeps the audio, home's word lets it go), `lib/agent-export/index.test.ts`
 *   ("LG1": a hand-off marks the session shared and keeps every reflection;
 *   the export lets nothing go), `components/reflection/__tests__/device-reflections-arrival.test.tsx`
 *   ("LG1"), topik's `generate-lesson/index.test.tsx` ("LG1": nothing asks
 *   after a drama share, and no note is removed), `lib/scene-voice`'s
 *   `runtime.test.ts` ("LG1": `letGoHeld` removes home's notes and no other),
 *   and soundbites' `project/__tests__/model.test.ts` and
 *   `studio/__tests__/studio.test.ts` ("LG1": a take kept by Drive stays on
 *   the phone; only `home` lets it go).
 */
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { assertNever } from "@some-ui/core-utils"
import type { KeptBite } from "@some-ui/game-week"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"

import { phoneGameBites } from "@/lib/game-bites"
import { jobVoiceAudio, phoneJobs } from "@/lib/jobs"
import type { JobEvent, JobsState } from "@/lib/jobs/model"
import {
  isSaving,
  onAudioSettled,
  reflectionAudio,
} from "@/lib/reflection-voice"
import type { SharedPrompt } from "@/lib/scene-voice"
import { onPromptShared, phoneSceneVoice } from "@/lib/scene-voice"
import { reflections } from "@/lib/session-reflection"
import type { Reflection } from "@/lib/session-reflection/policy"
import { onStudioKept, studioKeeping } from "@/lib/studio-keeping"
import { phoneVoiceHome } from "@/lib/voice-home"
import { exchangeVoice } from "@/lib/voice-home/home"
import type { CopyPass, Unsendable, VoiceOut } from "@/lib/voice-home/model"
import { NO_PASS, passWith, runEnd } from "@/lib/voice-home/model"

import { homeLink } from "./index"
import { paired } from "./lanes"

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
    case "outcome-withdrawn":
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
 * event that names it; a note whose entry is gone (let go) is left out. One
 * whose audio is gone (let go before LG1, once its share arrived in Drive)
 * is offered and found gone, and named as such (LA14).
 */
export function jobsNotes(state: JobsState): Array<VoiceOut> {
  const types = new Map(state.voice.map((note) => [note.id, note.mimeType]))
  const notes = new Map<string, VoiceOut>()
  for (const event of state.log) {
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

/** What this phone can't send home, from the last copy pass. */
export function unsendable(
  _jobs: JobsState,
  pass: CopyPass,
  settled: (id: string) => boolean
): Unsendable {
  return { gone: [...pass.gone].filter((id) => !settled(id)).length }
}

/** One note on this phone that could go home, and where its audio is. */
type Candidate = {
  readonly note: VoiceOut
  readonly audio: () => Promise<Blob | null>
}

/**
 * Studio's takes still on the phone that home doesn't hold yet, as last
 * read (`readStudio`): its store answers only asynchronously, so each copy
 * pass reads it first and the count renders what that read found.
 */
let studioTakes: ReadonlyArray<Candidate> = []
const studioListeners = new Set<() => void>()

/** What the last read of Studio's store found, for the lane's count. */
export const studioRead = {
  getSnapshot: (): ReadonlyArray<Candidate> => studioTakes,
  subscribe(listener: () => void): () => void {
    studioListeners.add(listener)
    return (): void => {
      studioListeners.delete(listener)
    }
  },
}

async function readStudio(): Promise<void> {
  const studio = studioKeeping()
  if (studio === null) return
  const { store } = studio
  studioTakes = studio
    .notesForHome(await store.list())
    .map(({ project, ...note }) => ({
      note: { ...note, of: "studio" },
      audio: (): Promise<Blob | null> => store.audio(project, note.id),
    }))
  for (const listener of studioListeners) listener()
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
  const named = jobsNotes(phoneJobs().getSnapshot().state).map((note) => ({
    note,
    audio: (): Promise<Blob | null> => jobVoiceAudio().get(note.id),
  }))
  const bites = phoneGameBites()
  const game = bites.ready().map((bite) => ({
    note: gameNote(bite),
    audio: (): Promise<Blob | null> => bites.audio(bite.id),
  }))
  return [...said, ...named, ...game, ...studioTakes]
}

/** A game bite, as home is told it. */
export function gameNote(bite: KeptBite): VoiceOut {
  return {
    id: bite.id,
    of: "game",
    ref: bite.gameId,
    at: bite.at,
    contentType: bite.contentType,
    fields: bite.fields,
  }
}

/** One note this phone failed to copy, to the native log (once per pass). */
function reported(error: unknown): void {
  reportFailure({
    port: "voice notes (copy for home)",
    error: {
      ...toIntentError(error),
      summary: "A voice note couldn't be copied for home.",
    },
  })
}

/**
 * Copies each note not yet copied, held or refused, while the phone is
 * paired, and says what it could not copy and why: a note whose
 * audio is gone, one with no room, one this phone failed to copy. A failure
 * goes on to the next note.
 */
async function copyAll(): Promise<CopyPass> {
  const home = phoneVoiceHome()
  let pass = NO_PASS
  const gone = new Set<string>()
  let failed = false
  await readStudio()
  for (const { note, audio } of candidates()) {
    if (!paired()) break
    if (home.settled(note.id)) continue
    try {
      const blob = await audio()
      if (blob === null) {
        gone.add(note.id)
        continue
      }
      // An unpairing can land while the audio is read.
      if (!paired()) break
      pass = passWith(pass, await home.copy(note, blob))
    } catch (error) {
      if (!failed) reported(error)
      failed = true
      pass = passWith(pass, "fault")
    }
  }
  return { ...pass, gone }
}

let copying: Promise<void> | null = null
let again = false
let lastPass = NO_PASS
const passListeners = new Set<() => void>()

/** What the last copy pass could not copy, for the lane's counts (`./voice`). */
export const copyPasses = {
  getSnapshot: (): CopyPass => lastPass,
  subscribe(listener: () => void): () => void {
    passListeners.add(listener)
    return (): void => {
      passListeners.delete(listener)
    }
  },
}

/** One copy pass at a time; a change during one asks for one more after it. */
function copySoon(): void {
  if (!paired()) return
  if (copying !== null) {
    again = true
    return
  }
  copying = copyAll()
    .catch((error: unknown): CopyPass => {
      reported(error)
      // What the last pass found gone stays gone.
      return { ...lastPass, roomless: 0, faults: 1 }
    })
    .then((pass) => {
      lastPass = pass
      for (const listener of passListeners) listener()
    })
    .finally(() => {
      copying = null
      if (again) {
        again = false
        copySoon()
      }
    })
}

/**
 * The voice lane's exchange: a copy pass first, so a note the watch could
 * not copy yet (no room, storage that would not keep its record) is tried
 * again, then each copy waiting sent (`exchangeVoice`). A run that sent all
 * it had still fails, saying why, if that pass left a note it could copy
 * uncopied (`runEnd`, LA14).
 */
export async function sendVoice(send: HomeCall): Promise<HomeExchanged> {
  copySoon()
  const running = copying
  if (running !== null) await running
  const pass = running === null ? NO_PASS : lastPass
  return runEnd(pass, await exchangeVoice(phoneVoiceHome().keeping, send))
}

/**
 * A drama prompt was shared with these notes: each is copied for home under
 * the prompt's stamp, while the phone is paired. Best effort, and nothing
 * waits on it; a failure goes to the native log.
 */
function copySceneNotes({ stamp, at, notes }: SharedPrompt): void {
  if (!paired()) return
  const home = phoneVoiceHome()
  for (const { id, mimeType, audio } of notes) {
    home
      .copy({ id, of: "scene", ref: stamp, at, contentType: mimeType }, audio)
      .catch(reported)
  }
}

/**
 * Lets each game bite (`lib/game-bites`), Studio take, Jobs voice note and
 * scene note home now holds leave this phone: home's read-back is the one
 * word that lets a note go (LG1, HF1 #2176).
 */
function letGoHeldBites(): void {
  const { held } = phoneVoiceHome().getSnapshot()
  // Home holds nothing on a phone that never sent: build no store for it.
  if (held.length === 0) return
  const holds = new Set(held)
  void phoneGameBites().letGo(holds)
  const studio = studioKeeping()
  studio?.letGoHeldTakes(holds).catch(reported)
  phoneJobs().letGoHeld(holds)
  phoneSceneVoice().letGoHeld(holds)
}

/**
 * Copies each new note while the phone is paired, until stopped. The stores
 * that hold notes are listened to only once the phone is paired, so a phone
 * that never was builds none of them for this.
 */

export function watchVoiceNotes(): () => void {
  const stores: Array<() => void> = []
  let takes = false
  const changed = (): void => {
    if (paired() && stores.length === 0) {
      stores.push(
        reflections.subscribe(copySoon),
        // A spoken reflection is listed before its audio is written.
        onAudioSettled(copySoon),
        phoneJobs().subscribe(copySoon),
        // A bite's release (Undo closed) is a change to its record.
        phoneGameBites().subscribe(copySoon)
      )
    }
    // A kept take is a write to its project, once Studio has handed it in.
    const studio = studioKeeping()
    if (stores.length > 0 && studio !== null && !takes) {
      takes = true
      stores.push(studio.store.subscribe(copySoon))
    }
    copySoon()
  }
  changed()
  letGoHeldBites()
  const stops = [
    phoneVoiceHome().subscribe(letGoHeldBites),
    onPromptShared(copySceneNotes),
    homeLink().subscribe(changed),
    onStudioKept(() => {
      changed()
      letGoHeldBites()
    }),
  ]
  return (): void => {
    for (const stop of [...stops, ...stores]) stop()
  }
}
