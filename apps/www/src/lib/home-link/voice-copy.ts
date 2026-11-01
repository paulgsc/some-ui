/**
 * Which voice notes go home and what each is told home as (LA13), and the
 * copying of each for home while the phone is paired (`lib/voice-home`):
 * outside React, so `./voice`'s hook only starts and stops it.
 *
 * - a reflection said aloud (`lib/reflection-voice`), recorded again or set
 *   aside or not (MIC5): `reflection`, its session, when it was said;
 * - a Jobs voice note (`lib/jobs`), once an event names it, or once the
 *   event that records its form files it out of the draft (#2443): `jobs`,
 *   the pick (`<day>:<pick>`) or scout, when that event was made;
 * - the drama's next scene said aloud (`lib/scene-voice`), once it is kept,
 *   asked for or not, set aside or not (HF2, #2177; MIC5): `scene`,
 *   `next-scene` (an ask names it by its id), when it was kept;
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
 *   session file and screen, when taken; its note goes as a study note;
 * - a Studio idea answer's take (`lib/idea-takes`, MIC10): `studio`, the
 *   answer as `idea:<idea>:<question>`, when taken; home gives its words back
 *   to the idea screen (`./heard`).
 *
 * Copying deletes nothing where the note was recorded; letting it go there
 * leaves the copy, which goes once home holds the note. Each pass says what
 * it could not copy and why (`copyPasses`), so Settings never counts as
 * waiting a note this phone cannot send (LA14).
 *
 * A note the owner let go where it was recorded (`standing: "set-aside"`,
 * D3 on epic #2368) owes home its set-aside mark (MIC2 #2372), so home's
 * routines stop reading it. Every store with Let go (reflections, Jobs
 * notes, scene notes, soundbites, lens and LeetType takes; game bites,
 * Studio takes and idea takes have none) sets a note aside through
 * `lib/voice-marks`. Let go owes the mark in the voice-home record before it writes the
 * standing (`lib/voice-marks`, which `watchVoiceNotes` wires), where it
 * outlives the note on this phone; each pass and each hand-off of what
 * home holds owes it for a note set aside before that (`oweMarks`); the run
 * sends those due once its exchange has synced (`./set-aside`). A Redo's
 * `earlier` take owes none: home has no such mark, and an earlier take is
 * still the owner's record.
 *
 * **LG1: nothing is let go on a third party's word** (HF1, #2176; the
 * owner's frame, `docs/learner-data-authority.md`, "The owner's deployment").
 *
 * - _Claim:_ no share, or share-sheet confirmation ("Did they arrive?",
 *   "They're in Drive"), of a kind the Family names removes an item from
 *   the phone; an
 *   item's audio or record leaves only once home has read it back (`held`,
 *   `letGoHeld`, the clear of finished sessions home holds, and a capped
 *   store making room with what home holds, the session budget's phone-full
 *   offer included: PF1), and a Drive copy is only ever a copy. A Studio take's audio leaves only once home holds it **and** the
 *   owner's choice allows it (HF11, #2401; soundbites' `lib/project/let-go`):
 *   none before they choose, every one under "Let takes go once home has
 *   them", and under "Keep each until Drive has it too" only the one they
 *   tap "Drive has it" on, or one home says Drive has
 *   (`./on-drive`: a Build Journal session's list of Drive's takes, which
 *   home matches by SHA-256; home never reaches Drive).
 * - _Family:_ every share kind (reflections; the study-context export with
 *   its soundbites, grammar-lens entries and takes, and LeetType answers and
 *   takes; Studio takes) and every cap that makes room (soundbites, lens
 *   takes, LeetType takes and answer notes, Studio idea takes, scene notes,
 *   and the grammar-lens record, HF5 #2180; the session budget's offer of
 *   the oldest finished session, "Remove it", #2422), whether the phone
 *   stores the room it makes or not (RM1, `lib/takes-desk/runtime.ts`),
 *   × every home state (held; waiting; unpaired; off the LAN, which the
 *   phone sees alike as not held); for Studio takes, × every
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
 *   ask home holds carried or that are out of the draft, and no other),
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
 *   one home holds makes room, and with none held the new one is refused),
 *   and for the session budget
 *   `components/settings/__tests__/device-storage.test.tsx` ("PF1": the
 *   offered session leaves on home's word alone, and stays when home can't
 *   keep it or the pairing moved or can't be read).
 * - _Tolerance:_ on a phone known to be unpaired, the session budget's
 *   offer deletes the session on the person's yes, after saying it can't be
 *   brought back: there is no home, so no one's word but theirs (PF1).
 */
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { assertNever } from "@some-ui/core-utils"
import type { KeptBite } from "@some-ui/game-week"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import type { Soundbite } from "@some-ui/soundbites"
import type { TakeKept } from "@some-ui/voice-capture"
import { ON_PHONE } from "@some-ui/voice-capture"

import { phoneGameBites } from "@/lib/game-bites"
import type { IdeaTake } from "@/lib/idea-takes"
import { ideaTakesDesk } from "@/lib/idea-takes"
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
  reflectionNotesKept,
} from "@/lib/reflection-voice"
import type { KeptSceneNote } from "@/lib/scene-voice"
import { phoneSceneVoice, sceneNotes, sceneNotesKept } from "@/lib/scene-voice"
import { reflections } from "@/lib/session-reflection"
import type { Reflection } from "@/lib/session-reflection/policy"
import { onSoundbitesKept, soundbiteKeeping } from "@/lib/soundbite-keeping"
import { onStudioKept, studioKeeping } from "@/lib/studio-keeping"
import { phoneVoiceHome } from "@/lib/voice-home"
import { exchangeVoice } from "@/lib/voice-home/home"
import type {
  AsideMark,
  AsidePort,
  CopyPass,
  Unsendable,
  VoiceHomeState,
  VoiceOut,
} from "@/lib/voice-home/model"
import {
  ASIDE_OWED_MAX,
  keptIn,
  NO_PASS,
  passWith,
  runEnd,
} from "@/lib/voice-home/model"
import { wireVoiceMarks } from "@/lib/voice-marks"

import { homeLink, paired } from "./index"
import { lensEntriesHeld } from "./lens-record"
import { notesHeld } from "./notes"
import { askOnDrive } from "./on-drive"
import { markSetAside } from "./set-aside"

/**
 * When a note was set aside (D3), ISO 8601, as its store recorded it
 * (`standing` and `setAsideAt`); null for one set aside with no time it can
 * read (before stores noted when, or a time that is no time); undefined for
 * one not set aside, a Redo's `earlier` included, which owes home no mark.
 * Its mark was owed at Let go (`lib/voice-marks`); this is how a pass owes
 * it for one set aside before that.
 */
export function asideAt(kept: object | undefined): string | null | undefined {
  if (kept === undefined) return undefined
  if (Reflect.get(kept, "standing") !== "set-aside") return undefined
  const at: unknown = Reflect.get(kept, "setAsideAt")
  const ms =
    typeof at === "number" ? at : typeof at === "string" ? Date.parse(at) : NaN
  // A number past the dates a Date can hold is no time either.
  const when = new Date(ms)
  return Number.isFinite(when.getTime()) ? when.toISOString() : null
}

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
  // A form's notes out of its draft (recorded again or set aside) go home
  // with the event that recorded the form, which names none of them (#2443).
  for (const note of state.voice) {
    if (note.filed === undefined || notes.has(note.id)) continue
    notes.set(note.id, {
      id: note.id,
      of: "jobs",
      ref: note.filed.ref,
      at: note.filed.at,
      contentType: note.mimeType,
    })
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

/**
 * A Studio idea answer's take (its `line` is `idea:<idea>:<question>`), as
 * home is told it: a Studio note, whose `ref` home reads as any other.
 */
export function ideaNote(take: IdeaTake): VoiceOut {
  return {
    id: take.id,
    of: "studio",
    ref: refOf(take.line),
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

/**
 * One note on this phone that could go home, where its audio is, and, for
 * one set aside, when (`asideAt`).
 */
type Candidate = {
  readonly note: VoiceOut
  readonly audio: () => Promise<Blob | null>
  readonly aside?: string | null | undefined
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

/**
 * Whether the soundbites were read in the last copy pass: only then does
 * their list say which are set aside, and which have left the phone.
 */
let soundbitesFresh = false

async function readSoundbites(): Promise<void> {
  const kept = soundbiteKeeping()
  if (kept === null) return
  const { store } = kept
  const bites = await store.list()
  soundbites = bites.map((bite) => ({
    note: soundbiteNote(bite),
    audio: (): Promise<Blob | null> => store.audio(bite.id),
    aside: asideAt(bite),
  }))
  soundbitesFresh = true
  wasRead()
}

/**
 * The stores with Let go read as they are now (`MarkFrom`): every one but
 * the soundbites at each look, and those once the last copy pass read them.
 * A mark of an earlier build names no store, so its note is read only when
 * every store is.
 */
function readNow(from: string | undefined): boolean {
  if (from === undefined || from === "soundbite") return soundbitesFresh
  return true
}

/**
 * Which set-aside marks may go to home now (MIC2, LA13): one whose note its
 * store lists as set aside, or whose note its store, read, lists no more
 * (it left the phone once home held it). One whose note is listed as
 * current goes nowhere: its set-aside write is pending or never happened
 * (the soundbites' store writes after the mark is owed, and the app can be
 * closed between).
 */
function marksSendable(
  listed: ReadonlyArray<Candidate>
): (mark: AsideMark) => boolean {
  const standing = standingsRead(listed)
  return (mark): boolean => standing.get(mark.id) ?? readNow(mark.from)
}

/**
 * Whether each note `listed` is set aside, by id, from the stores read now
 * alone: soundbites listed by a read that is not the last pass's say
 * nothing, so a stale list can neither send a mark nor take one back.
 */
function standingsRead(
  listed: ReadonlyArray<Candidate>
): ReadonlyMap<string, boolean> {
  return new Map(
    listed
      .filter(({ note }) => readNow(note.of))
      .map(({ note, aside }) => [note.id, aside !== undefined])
  )
}

/**
 * Settles the marks owed against what the stores list (MIC2, LA13): one
 * whose note is listed as current is taken back, its set-aside write never
 * having landed; one whose note no store it could be in lists, read, and
 * whose copy neither waits nor is held is forgotten, since it left the
 * phone before home had it and no mark of it can be taken; and past
 * `ASIDE_OWED_MAX`, the oldest marks of notes that left the phone are
 * dropped, so a home that never takes a mark leaves the record bounded.
 */
function settleMarks(listed: ReadonlyArray<Candidate>): void {
  const home = phoneVoiceHome()
  const { owed } = home.getSnapshot().aside
  if (owed.length === 0) return
  const standing = standingsRead(listed)
  for (const mark of owed) {
    if (standing.get(mark.id) === false) home.unowe(mark.id)
  }
  const left = owed.filter(
    (mark) => !standing.has(mark.id) && readNow(mark.from)
  )
  home.forget(left.map(({ id }) => id))
  // Past the cap, the oldest marks of notes that left the phone go, home
  // holding them or not: a home without the set-aside route never takes
  // one. A mark whose note is on the phone, or waits to go home, stays.
  const kept = home.getSnapshot()
  const over = kept.aside.owed.length - ASIDE_OWED_MAX
  if (over <= 0) return
  const waiting = new Set(kept.waiting.map((note) => note.id))
  const gone = new Set(left.map(({ id }) => id))
  home.drop(
    kept.aside.owed
      .filter((mark) => gone.has(mark.id) && !waiting.has(mark.id))
      .slice(0, over)
      .map(({ id }) => id)
  )
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
              aside: asideAt(
                reflection.body.kind === "voice" ? reflection.body : undefined
              ),
            },
          ]
    })
  const jobs = phoneJobs().getSnapshot().state
  const jobVoice = new Map(jobs.voice.map((kept) => [kept.id, kept]))
  const named = jobsNotes(jobs).map((note) => ({
    note,
    audio: (): Promise<Blob | null> => jobVoiceAudio().get(note.id),
    aside: asideAt(jobVoice.get(note.id)),
  }))
  const now = new Date()
  const scene = sceneNotes.read().map((kept) => ({
    note: sceneNote(kept, now),
    aside: asideAt(kept),
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
    aside: asideAt(take),
  }))
  const leetype = leetypeTakesDesk.kept().map((take) => ({
    note: leetypeNote(take),
    audio: (): Promise<Blob | null> => leetypeTakesDesk.audio(take.id),
    aside: asideAt(take),
  }))
  const ideas = ideaTakesDesk.kept().map((take) => ({
    note: ideaNote(take),
    audio: (): Promise<Blob | null> => ideaTakesDesk.audio(take.id),
    aside: asideAt(take),
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
    ...ideas,
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

/**
 * Notes, in the voice-home record, the mark home is owed for each of
 * `listed` set aside before Let go owed it (`lib/voice-marks`): when its
 * store says it was let go, or now for one with no time it can read. The
 * first time noted stands, so a mark already owed or answered is left as it
 * is.
 */
function oweMarks(listed: ReadonlyArray<Candidate>): void {
  const home = phoneVoiceHome()
  const now = new Date().toISOString()
  for (const { note, aside } of listed) {
    if (aside !== undefined) home.owe(note.id, aside ?? now, note.of)
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
  soundbitesFresh = false
  const listed = await readEach(
    [
      { source: "Studio takes", read: readStudio },
      { source: "soundbites", read: readSoundbites },
    ],
    unreadSource
  )
  if (!listed) pass = passWith(pass, "fault")
  const all = candidates()
  oweMarks(all)
  settleMarks(all)
  for (const { note, audio } of all) {
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
 * synced, home's word on which Studio takes Drive has (`letGoOnHomesWord`)
 * and the set-aside marks due (`markSetAside`, MIC2), which end the run in
 * its exchange's place. A run that sent all it had still fails, saying why,
 * if that pass left a note it could copy uncopied (`runEnd`, LA14).
 */
export async function sendVoice(send: HomeCall): Promise<HomeExchanged> {
  copySoon()
  const running = copying
  if (running !== null) await running
  const pass = running === null ? NO_PASS : lastPass
  const home = phoneVoiceHome()
  const exchanged = await exchangeVoice(home.keeping, send)
  if (exchanged.kind !== "synced") return runEnd(pass, exchanged)
  await letGoOnHomesWord(send)
  const sendable = marksSendable(candidates())
  const marks: AsidePort = {
    due: () => home.marks.due().filter(sendable),
    answered: home.marks.answered,
  }
  return runEnd(pass, await markSetAside(marks, send))
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

/** Where each note is kept, made again only when the record changes. */
let kept: {
  readonly from: VoiceHomeState
  readonly of: (id: string) => TakeKept
} | null = null

/**
 * Where a take of a kind this lane carries is kept, and since when (MIC3):
 * what its desk's rows say. A copy waiting while the phone is unpaired goes
 * nowhere, so its take is kept on this phone until the phone is paired again
 * (`holdOffline` hears the pairing change). A kind no lane carries is never
 * asked, so its rows say it is kept on this phone.
 */
export function voiceKept(id: string): TakeKept {
  const state = phoneVoiceHome().getSnapshot()
  if (kept?.from !== state) kept = { from: state, of: keptIn(state) }
  const where = kept.of(id)
  return where.place === "going" && !paired() ? ON_PHONE : where
}

/** A store whose notes leave this phone once home holds them. */
type LetsGo = { letGo: (homeHolds: ReadonlySet<string>) => unknown }

/**
 * Hands what home now holds to each store of game bites (`lib/game-bites`),
 * Jobs voice notes, scene notes and Studio takes, whose `letGo` says which
 * of them leave this phone (LG1). A note set aside before Let go owed its
 * mark is owed it first (`oweMarks`).
 */
function letGoHeld(): void {
  const holds = heldIds()
  // Home holds nothing on a phone that never sent: build no store for it.
  if (holds.size === 0) return
  oweMarks(candidates())
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
 * Hands the offline sets whose records go as study notes (`./notes`) what
 * home holds of them, read back: LeetType's answer notes by their study
 * notes, and a soundbite once home holds both its audio and its record. Each
 * store tells its screen, so a "full" line drawn before home held any clears
 * (OS1, #2408). Practice's drain calls it once its notes part ends, since
 * that run is what moves what home holds of their records.
 */
export function holdNotes(): void {
  leetypeNotesHeldByHome(() => notesHeld("leetype"))
  soundbiteKeeping()?.heldByHome((): ((id: string) => boolean) => {
    const records = notesHeld("soundbite")
    return (id): boolean => voiceHeld(id) && records(id)
  })
}

/**
 * Hands each offline set what home holds, read back, so it may make room at
 * its cap with those and no others (HF5): the lens takes, LeetType takes and
 * Studio idea takes by their voice notes, with where each is kept (MIC3,
 * `voiceKept`), where each scene note and each spoken reflection is kept,
 * the stores of study notes (`holdNotes`), and the grammar-lens record by
 * each entry as it is now. Each reads `sent` once per look.
 */
function holdOffline(): void {
  lensTakesDesk.keptWhere(voiceKept)
  leetypeTakesDesk.keptWhere(voiceKept)
  ideaTakesDesk.keptWhere(voiceKept)
  sceneNotesKept(voiceKept)
  reflectionNotesKept(voiceKept)
  holdNotes()
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
        lensTakesDesk.phone().takes.subscribe(copySoon),
        leetypeTakesDesk.phone().takes.subscribe(copySoon),
        ideaTakesDesk.phone().subscribe(copySoon)
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
  // First, so nothing below can leave Let go owing nothing for the launch:
  // it owes each note's mark in the record before its standing is written
  // (LA13).
  const unwire = wireVoiceMarks({
    owe: (id, at, from) => phoneVoiceHome().owe(id, at, from),
    unowe: (id): void => {
      phoneVoiceHome().unowe(id)
    },
  })
  holdOffline()
  changed()
  letGoHeld()
  const stops = [
    unwire,
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
