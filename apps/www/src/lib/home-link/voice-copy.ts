/**
 * Which voice notes go home and what each is told home as (LA13), and the
 * copying of each for home while the phone is paired (`lib/voice-home`):
 * outside React, so `./voice`'s hook only starts and stops it.
 *
 * - a reflection said aloud (`lib/reflection-voice`): `reflection`, its
 *   session, when it was said;
 * - a Jobs voice note (`lib/jobs`), once an event names it: `jobs`, the
 *   pick (`<day>:<pick>`) or scout, when that event was made;
 * - the drama's next scene said aloud (`lib/scene-voice`), once it is kept,
 *   asked for or not (HF2, #2177): `scene`, `next-scene` (an ask names it
 *   by its id), when it was kept;
 * - a game bite (`lib/game-bites`), once Undo and the question of what it
 *   was about are closed: `game`, the game's ESPN id, when it was kept, and
 *   every field it keeps;
 * - a Studio take still on the phone (`@some-ui/soundbites`' `notesForHome`,
 *   handed in by Studio's route, `lib/studio-keeping`): `studio`, the take as
 *   `<project>:<shot>:<take>`, when it was recorded; once home holds it, it
 *   waits on the phone for the owner's choice of when it leaves (HF11);
 * - a soundbite (`@some-ui/soundbites`' store, handed in by its page,
 *   `lib/soundbite-keeping`; HF5 #2180): `soundbite`, how it came to be
 *   recorded, when it was; its record goes as a study note (`./notes`);
 * - a grammar-lens take (`lib/lens-takes`): `lens`, the line, when taken;
 * - a LeetType spoken answer's take (`lib/leetype-takes`): `leetype`, the
 *   session file and screen, when taken; its note goes as a study note.
 *
 * Copying deletes nothing where the note was recorded; letting it go there
 * leaves the copy, which goes once home holds the note. Each pass says what
 * it could not copy and why (`copyPasses`), so Settings never counts as
 * waiting a note this phone cannot send (LA14).
 *
 * **LG1: nothing is let go on a third party's word** (HF1, #2176; the
 * owner's frame, `docs/learner-data-authority.md`, "The owner's deployment").
 *
 * - _Claim:_ no share, or share-sheet confirmation ("Did they arrive?",
 *   "They're in Drive"), of a kind the Family names removes an item from
 *   the phone; an
 *   item's audio or record leaves only once home has read it back (`held`,
 *   `letGoHeld`, the clear of finished sessions home holds, and a capped
 *   store making room with what home holds), and a Drive copy is only ever
 *   a copy. A Studio take's audio leaves only once home holds it **and** the
 *   owner's choice allows it (HF11, #2401; soundbites' `lib/project/let-go`):
 *   none before they choose, every one under "Let takes go once home has
 *   them", and under "Keep each until Drive has it too" only the one they
 *   tap "Drive has it" on, or one home says Drive has
 *   (`./on-drive`: a Build Journal session's list of Drive's takes, which
 *   home matches by SHA-256; home never reaches Drive).
 * - _Family:_ every share kind (reflections; the study-context export with
 *   its soundbites, grammar-lens entries and takes, and LeetType answers and
 *   takes; Studio takes) and every cap that makes room (soundbites, lens
 *   takes, LeetType takes and answer notes, and the grammar-lens record,
 *   HF5 #2180) × every home state (held; waiting; unpaired; off the LAN,
 *   which the phone sees alike as not held); for Studio takes, × every
 *   choice (none yet, once home has them, until Drive has it too) × the
 *   owner's "Drive has it" on the take (tapped or not), home's word that
 *   Drive has it (said, not said, or not read) and the share sheet's
 *   "They're in Drive" (said or not), which lets nothing go.
 * - _Proof:_ `lib/jobs/__tests__/runtime.test.ts` ("LG1": home's word lets
 *   a note's audio go, and a file a run missed is filed again with the audio
 *   still on the phone), `lib/agent-export/index.test.ts`
 *   ("LG1": a hand-off marks the session shared and keeps every reflection;
 *   the export lets nothing go), topik's `generate-lesson/index.test.tsx`
 *   ("LG1": an ask removes no scene note), `lib/scene-voice`'s
 *   `runtime.test.ts` ("LG1": `letGo` removes the notes home holds that an
 *   ask home holds carried, and no other),
 *   soundbites' `project/__tests__/model.test.ts` ("LG1": a take kept by
 *   Drive stays on the phone; only `home` lets it go),
 *   `project/__tests__/home.test.ts` ("LG1": every choice, home holding the
 *   take; "LG1: on home's word…": none before the choice, and a take home
 *   does not hold never) and `studio/__tests__/studio.test.ts` ("LG1": a
 *   take kept by Drive stays on the phone; "a take home holds (HF11, LG1)":
 *   nothing before the choice, every one on "once home has them", only the
 *   tapped one on "until Drive has it too", none when the choice can't be
 *   kept), `lib/home-link/__tests__/voice-send.test.ts` ("LG1": home's word
 *   is asked for only under "until Drive has it too", and a read that fails
 *   lets nothing go) and `on-drive.test.ts` ("LG1": an answer that is not
 *   home's word is none), and for the caps (HF5) soundbites'
 *   `__tests__/policy.test.ts` and `components/soundbites/index.test.tsx`,
 *   `lib/takes-desk/__tests__/runtime.test.ts`,
 *   `lib/leetype-takes/index.test.ts` and topik's
 *   `adapter/lens-record-store/index.test.ts` (each "HF5": at the cap only
 *   one home holds makes room, and with none held the new one is refused).
 */
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { assertNever } from "@some-ui/core-utils"
import type { KeptBite } from "@some-ui/game-week"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import type { Soundbite } from "@some-ui/soundbites"

import { phoneGameBites } from "@/lib/game-bites"
import { jobVoiceAudio, phoneJobs } from "@/lib/jobs"
import type { JobEvent, JobsState } from "@/lib/jobs/model"
import type { LeetypeTake } from "@/lib/leetype-takes"
import { leetypeNotesHeldByHome, leetypeTakesDesk } from "@/lib/leetype-takes"
import type { LensTake } from "@/lib/lens-takes"
import { lensTakesDesk } from "@/lib/lens-takes"
import {
  isSaving,
  onAudioSettled,
  reflectionAudio,
} from "@/lib/reflection-voice"
import type { KeptSceneNote } from "@/lib/scene-voice"
import { phoneSceneVoice, sceneNotes } from "@/lib/scene-voice"
import { reflections } from "@/lib/session-reflection"
import type { Reflection } from "@/lib/session-reflection/policy"
import { onSoundbitesKept, soundbiteKeeping } from "@/lib/soundbite-keeping"
import { onStudioKept, studioKeeping } from "@/lib/studio-keeping"
import { phoneVoiceHome } from "@/lib/voice-home"
import { exchangeVoice } from "@/lib/voice-home/home"
import type { CopyPass, Unsendable, VoiceOut } from "@/lib/voice-home/model"
import { NO_PASS, passWith, runEnd } from "@/lib/voice-home/model"

import { homeLink, paired } from "./index"
import { lensEntriesHeld } from "./lens-record"
import { notesHeld } from "./notes"
import { askOnDrive } from "./on-drive"

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
 * event that names it; a note whose entry is gone (let go, or home holds
 * it) is left out. One whose entry stays but whose audio is gone is offered,
 * found gone and named as such (LA14).
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

/**
 * A scene note, as home is told it. One kept before the phone noted when is
 * told home as of now.
 */
export function sceneNote(note: KeptSceneNote, now: Date): VoiceOut {
  return {
    id: note.id,
    of: "scene",
    ref: "next-scene",
    at: note.at ?? now.toISOString(),
    contentType: note.mimeType,
  }
}

/**
 * `text` as a `ref` home takes: letters, digits, `.`, `_`, `:` and `-`, at
 * most 200; anything else becomes `-`.
 */
export function refOf(text: string): string {
  const ref = text.replace(/[^\w.:-]+/g, "-").slice(0, 200)
  return ref === "" ? "-" : ref
}

/** A grammar-lens take, as home is told it. */
export function lensNote(take: LensTake): VoiceOut {
  return {
    id: take.id,
    of: "lens",
    ref: refOf(take.line),
    at: new Date(take.takenAt).toISOString(),
    contentType: take.mimeType,
  }
}

/** A LeetType spoken answer's take (its `line` is `<file>#<screen>`), as home is told it. */
export function leetypeNote(take: LeetypeTake): VoiceOut {
  return {
    id: take.id,
    of: "leetype",
    ref: refOf(take.line.replace("#", ":")),
    at: new Date(take.takenAt).toISOString(),
    contentType: take.mimeType,
  }
}

/** A soundbite, as home is told it. */
export function soundbiteNote(bite: Soundbite): VoiceOut {
  return {
    id: bite.id,
    of: "soundbite",
    ref: bite.context.source,
    at: bite.recordedAt,
    contentType: bite.mimeType,
  }
}

/** What this phone can't send home, from the last copy pass. */
export function unsendable(
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
 * Studio's takes still on the phone that home doesn't hold yet, and the
 * soundbites on the phone, each as last read (`readStudio`,
 * `readSoundbites`): their stores answer only asynchronously, so each copy
 * pass reads them first and the count renders what those reads found.
 */
let studioTakes: ReadonlyArray<Candidate> = []
let soundbites: ReadonlyArray<Candidate> = []
/** Moves with each read of either store. */
let reads = 0
const readListeners = new Set<() => void>()

function wasRead(): void {
  reads += 1
  for (const listener of readListeners) listener()
}

/** What the last reads of Studio's and the soundbites' stores found, for the lane's count. */
export const storesRead = {
  getSnapshot: (): number => reads,
  subscribe(listener: () => void): () => void {
    readListeners.add(listener)
    return (): void => {
      readListeners.delete(listener)
    }
  },
}

async function readSoundbites(): Promise<void> {
  const kept = soundbiteKeeping()
  if (kept === null) return
  const { store } = kept
  const bites = await store.list()
  soundbites = bites.map((bite) => ({
    note: soundbiteNote(bite),
    audio: (): Promise<Blob | null> => store.audio(bite.id),
  }))
  wasRead()
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
  wasRead()
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
  const now = new Date()
  const scene = sceneNotes.read().map((kept) => ({
    note: sceneNote(kept, now),
    audio: (): Promise<Blob | null> => sceneNotes.audio(kept.id),
  }))
  const bites = phoneGameBites()
  const game = bites.ready().map((bite) => ({
    note: gameNote(bite),
    audio: (): Promise<Blob | null> => bites.audio(bite.id),
  }))
  const lens = lensTakesDesk.kept().map((take) => ({
    note: lensNote(take),
    audio: (): Promise<Blob | null> => lensTakesDesk.audio(take.id),
  }))
  const leetype = leetypeTakesDesk.kept().map((take) => ({
    note: leetypeNote(take),
    audio: (): Promise<Blob | null> => leetypeTakesDesk.audio(take.id),
  }))
  return [
    ...said,
    ...named,
    ...scene,
    ...game,
    ...studioTakes,
    ...soundbites,
    ...lens,
    ...leetype,
  ]
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

/** A store whose notes are listed only asynchronously, and what it is called. */
type SourceRead = {
  readonly source: string
  readonly read: () => Promise<void>
}

/**
 * Reads each source in turn: one that can't be read holds back none after
 * it, keeps its notes as last read, and is told to `unread`. Says whether
 * every one was read.
 */
async function readEach(
  reads: ReadonlyArray<SourceRead>,
  unread: (source: string, error: unknown) => void
): Promise<boolean> {
  let all = true
  for (const { source, read } of reads) {
    try {
      await read()
    } catch (error) {
      all = false
      unread(source, error)
    }
  }
  return all
}

/** A store this phone could not list its notes from, to the native log. */
function unreadSource(source: string, error: unknown): void {
  reportFailure({
    port: `voice notes (list ${source})`,
    error: {
      ...toIntentError(error),
      summary: `The ${source} on this phone couldn't be listed to copy for home.`,
    },
  })
}

/**
 * Copies each note not yet copied, held or refused, while the phone is
 * paired, and says what it could not copy and why: a note whose
 * audio is gone, one with no room, one this phone failed to copy or list. A
 * failure goes on to the next note, and a store that can't be listed to the
 * next store.
 */
async function copyAll(): Promise<CopyPass> {
  const home = phoneVoiceHome()
  let pass = NO_PASS
  const gone = new Set<string>()
  let failed = false
  const listed = await readEach(
    [
      { source: "Studio takes", read: readStudio },
      { source: "soundbites", read: readSoundbites },
    ],
    unreadSource
  )
  if (!listed) pass = passWith(pass, "fault")
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

/** Home's word on Drive could not be read or acted on, to the native log. */
function unheard(error: unknown): void {
  reportFailure({
    port: "voice notes (which takes Drive has)",
    error: {
      ...toIntentError(error),
      summary:
        "Home couldn't be asked which Studio takes Drive has, so those takes stay on this phone.",
    },
  })
}

/**
 * Under "Keep each until Drive has it too", asks home which of the Studio
 * takes it holds, still on this phone, a Build Journal session found in
 * Drive (`./on-drive`, HF11), and lets those go, as the owner's choice allows (LG1). Under any
 * other choice it asks nothing: "once home has them" lets them go already,
 * and before a choice none leaves. What it cannot read lets nothing go, and
 * the run it rides ends as its notes did.
 */
async function letGoOnHomesWord(send: HomeCall): Promise<void> {
  const studio = studioKeeping()
  if (studio?.letGo() !== "drive") return
  try {
    const ids = studio.waitingIds(await studio.store.list())
    if (ids.length === 0) return
    const onDrive = await askOnDrive(send, ids)
    if (onDrive === null) {
      unheard(new Error("home did not answer which takes Drive has"))
      return
    }
    await studio.letGoOnDrive(onDrive)
  } catch (error) {
    unheard(error)
  }
}

/**
 * The voice lane's exchange: a copy pass first, so a note the watch could
 * not copy yet (no room, storage that would not keep its record) is tried
 * again, then each copy waiting sent (`exchangeVoice`), then, once that
 * synced, home's word on which Studio takes Drive has (`letGoOnHomesWord`).
 * A run that sent all it had still fails, saying why, if that pass left a
 * note it could copy uncopied (`runEnd`, LA14).
 */
export async function sendVoice(send: HomeCall): Promise<HomeExchanged> {
  copySoon()
  const running = copying
  if (running !== null) await running
  const pass = running === null ? NO_PASS : lastPass
  const exchanged = await exchangeVoice(phoneVoiceHome().keeping, send)
  if (exchanged.kind === "synced") await letGoOnHomesWord(send)
  return runEnd(pass, exchanged)
}

/** Home's held notes as a set, made again only when the list changes. */
let heldFrom: ReadonlyArray<string> | null = null
let heldSet: ReadonlySet<string> = new Set()

function heldIds(): ReadonlySet<string> {
  const { held } = phoneVoiceHome().getSnapshot()
  if (held !== heldFrom) {
    heldFrom = held
    heldSet = new Set(held)
  }
  return heldSet
}

const voiceHeld = (id: string): boolean => heldIds().has(id)

/** A store whose notes leave this phone once home holds them. */
type LetsGo = { letGo: (homeHolds: ReadonlySet<string>) => unknown }

/**
 * Hands what home now holds to each store of game bites (`lib/game-bites`),
 * Jobs voice notes, scene notes and Studio takes, whose `letGo` says which
 * of them leave this phone (LG1).
 */
function letGoHeld(): void {
  const holds = heldIds()
  // Home holds nothing on a phone that never sent: build no store for it.
  if (holds.size === 0) return
  const stores: ReadonlyArray<LetsGo> = [
    phoneGameBites(),
    phoneJobs(),
    phoneSceneVoice(),
  ]
  for (const store of stores) void store.letGo(holds)
  studioKeeping()?.letGoHeldTakes(holds).catch(reported)
}

/** Whether the grammar-lens record has been told how to read what home holds. */
let lensRecordTold = false

/**
 * Tells the grammar-lens record, once, how to read what home holds of it.
 * Its reading follows the pairing on its own, so once is enough, and a
 * phone never paired loads none of topik for it.
 */
function holdLensRecord(): void {
  if (lensRecordTold || !paired()) return
  lensRecordTold = true
  import("@some-ui/topik")
    .then(({ lensRecordHeldByHome }) => {
      lensRecordHeldByHome(lensEntriesHeld)
    })
    .catch((error: unknown) => {
      lensRecordTold = false
      reported(error)
    })
}

/**
 * Hands each offline set what home holds, read back, so it may make room at
 * its cap with those and no others (HF5): the lens takes and LeetType takes
 * by their voice notes, LeetType's answer notes by their study notes, a
 * soundbite once home holds both its audio and its record, and a grammar-lens
 * entry once home holds it as it is now. Each reads `sent` once per look.
 */
function holdOffline(): void {
  lensTakesDesk.heldByHome(voiceHeld)
  leetypeTakesDesk.heldByHome(voiceHeld)
  leetypeNotesHeldByHome(() => notesHeld("leetype"))
  soundbiteKeeping()?.heldByHome((): ((id: string) => boolean) => {
    const records = notesHeld("soundbite")
    return (id): boolean => voiceHeld(id) && records(id)
  })
  holdLensRecord()
}

/**
 * Copies each new note while the phone is paired, until stopped. The stores
 * that hold notes are listened to only once the phone is paired, so a phone
 * that never was builds none of them for this.
 */

export function watchVoiceNotes(): () => void {
  const stores: Array<() => void> = []
  let takes = false
  let saidBites = false
  const changed = (): void => {
    if (paired() && stores.length === 0) {
      stores.push(
        reflections.subscribe(copySoon),
        // A spoken reflection is listed before its audio is written.
        onAudioSettled(copySoon),
        phoneJobs().subscribe(copySoon),
        // A scene note is listed once its audio is written.
        phoneSceneVoice().subscribe(() => {
          copySoon()
          letGoHeld()
        }),
        // A bite's release (Undo closed) is a change to its record.
        phoneGameBites().subscribe(copySoon),
        lensTakesDesk.phone().subscribe(copySoon),
        leetypeTakesDesk.phone().subscribe(copySoon)
      )
    }
    // A kept take is a write to its project, once Studio has handed it in.
    const studio = studioKeeping()
    if (stores.length > 0 && studio !== null && !takes) {
      takes = true
      stores.push(studio.store.subscribe(copySoon))
    }
    // Likewise a soundbite, once its page has handed its store in.
    const bites = soundbiteKeeping()
    if (stores.length > 0 && bites !== null && !saidBites) {
      saidBites = true
      stores.push(bites.store.subscribe(copySoon))
    }
    copySoon()
  }
  holdOffline()
  changed()
  letGoHeld()
  const stops = [
    phoneVoiceHome().subscribe(letGoHeld),
    // What home holds moved: the offline sets may make room again.
    phoneVoiceHome().subscribe(holdOffline),
    homeLink().subscribe(holdOffline),
    homeLink().subscribe(changed),
    onStudioKept(() => {
      changed()
      letGoHeld()
    }),
    onSoundbitesKept(() => {
      holdOffline()
      changed()
    }),
  ]
  return (): void => {
    for (const stop of [...stops, ...stores]) stop()
  }
}
