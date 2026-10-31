/**
 * What the phone knows about how studying is going, as files for an agent
 * (Claude, ChatGPT) to read, handed to Android's share sheet so the person
 * picks where they go (Drive, say); nothing here sends anything anywhere.
 *
 * One share, `shareAgentExport`: everything, as one `context.json` (sessions,
 * each with its reflections and path counts, stops, soundbites and the
 * read-aloud practice record) and every recording beside it. The
 * reflections that went out read as shared once the person says they arrived
 * (`handOff`). Written reflections reach the routine from home through the
 * Jobs mailbox (LA16).
 *
 * Phone-only: rendered only in the device build, so no other profile ships it
 * (`build.paths.ts`).
 */
import {
  extensionOf,
  jsonOf,
  localStorageOrNull,
  openKept,
} from "@some-ui/core-utils"
import type { SessionSummary } from "@some-ui/leetype"
import type { Soundbite, SoundbiteStore } from "@some-ui/soundbites"
import type {
  LensRecordExport,
  PracticeRecord,
  ReadAloudFeedback,
} from "@some-ui/topik"

import { foreignValue } from "@/lib/intent/foreign"
import type { LeetypeTake, LeetypeTakeNote } from "@/lib/leetype-takes"
import { leetypeTakesForExport } from "@/lib/leetype-takes"
import type { LensTake } from "@/lib/lens-takes"
import { lensTakesForExport } from "@/lib/lens-takes"
import { isSaving, reflectionAudio } from "@/lib/reflection-voice"
import type { Reflection } from "@/lib/session-reflection"
import { inOrder, QUESTIONS, reflections } from "@/lib/session-reflection"
import {
  allPathCounts,
  allStops,
  pathCounts,
  REASONS,
} from "@/lib/session-stop"
import type { SharedFile } from "@/lib/share-files"
import { shareFiles } from "@/lib/share-files"
import type { SessionRecord } from "@/lib/tenant"
import { sessionsRepository } from "@/lib/tenant/queries"

type SoundbiteReader = Pick<SoundbiteStore, "list" | "audio">

const READ_ALOUD_PRACTICE =
  "`readAloudPractice` is the read-aloud drill's practice record: for each of the 60 most recent days that had any (a day without practice has no entry, and an old day stays until 60 newer ones replace it), and in `totals` for all time, the reps read to the end, the sets finished and the practice they are credited with (a nominal time per rep, not the clock). All zeros means nothing was recorded or the stored record could not be read, which the app cannot tell apart; null means the app could not load the drill at all."

const READ_ALOUD_FEEDBACK =
  "`readAloudFeedback` is what the learner said at the end of read-aloud sittings, as two separate answers: `tooEasy` (they want harder sentences) and `tooManyRepeats` (they want more variety), each with `at`, when they gave it (ISO), or null if they have not. They can give either, both or neither. An answer stays on the phone until they take it back, so read its `at` against the date of the session it comes with. The whole field is null when they gave neither, or the app could not read them. Neither answer moves their level, and a stuck report is not one of them."

const GRAMMAR_LENS = [
  "`grammarLens` is the grammar-lens session's record (`grammarLens.entries`): one entry per item, most recent last. The entries stay on the phone: this file is a copy.",
  "An item asked about one `line` of a read-aloud set (its id; the line itself is in the set) by showing a pick (choose the word's form), a judge with a misform in place (find the wrong word), or a judge as written (nothing wrong). `session` is when its grammar-lens session began, `shownAt` and `closedAt` when the item was shown and closed (ISO).",
  '`cue` is how the line it answered was given: "glyph" read (also a cue meant to be heard that could not be), "audio" heard, "both", or null for none. `answer` is the form picked, the word tapped as it was shown, or "looks right"; `shown` names the mistake-catalogue entries the item showed, `chosen` the one picked if the learner fell for it, and `expired` an item left unanswered for two minutes.',
  "`answerMs` is the time from its showing to its answer, its pauses left out, and `rushed` whether that was faster than reading the line, and the cue when it was read, at twice the level's rate. `racing` means three of five answers in the session were rushed by then; it stays so, and `grammarLens.sessions` says it per session. Weigh a racing session's entries less.",
  'After a miss, `stepDown` lists easier questions on the same line, each with its `rung` (4 tense, 3 subject or object, 2 where the ending starts, 1 the verb), `kind`, the `word` it named if any, the `answer` as text (a word, a cut such as 가|요, or a tense) and whether it was right; `end` says how it stopped ("right", "ran-out", "skipped", "expired", or "left" when the session ended during it) and `floor` the rung that came right first (0 when it ran out, else null). `situation` is the optional "when would someone say this" pick and whether it matched the author\'s.',
  "`take` is the learner's recordings of the line after its reveal (`lensTakes`): how many were kept, the last one's length (`lastMs`), and whether they heard the line before the first (`heardFirst`); null when they made none.",
  "Use it to choose the next deck's misforms, cues and level. Null means the app could not load the record; no entries, that the phone held none it could read.",
].join(" ")

const LENS_TAKES =
  "`lensTakes` are the learner's own recordings of a grammar-lens line read aloud, made after its reveal, newest first: which `line`, when (`takenAt`, ms since the epoch), how long, and the audio as the file named in `file` (null: the audio could not be read). Nothing graded them. Each goes to the learner's home server, which keeps every one; the phone keeps at most 40, each at most 30 seconds, and lets an older one go only once home has it. This file is a copy. Listen for how the line is read, beside its `grammarLens` entries. Null means the app could not read them."

const LEETYPE_ANSWERS =
  "`leetypeAnswers` are the learner's spoken answers in LeetType's phone sessions (Def. 9.5 of docs/canon/complexity-witness-canon.typ), newest first: for each, the session file and its record screen (`file`, `screen`), the one-sentence `prompt`, the `rubric` shown only after answering, the points the learner ticked (`ticks`: their own reading of it, never a grade), and either the take's audio as the file named in `audio` (null: no take, or its audio could not be read) or, where they could not speak, the `typed` answer. `leetypeTakes` lists every take kept, with or without an answer noted (the app closed before the ticks). Each goes to the learner's home server, which keeps every one; the phone keeps at most 40 of each, each take at most 60 seconds, and lets an older one go only once home has it. This file is a copy. The weekly review reads them: what the learner can now explain, what they still cannot, and which readings to place. Null means the app could not read them."

const LEETYPE_SESSIONS =
  "`leetypeSessions` says how each LeetType session went, in the order they started, derived from the phone's session log (Prop. 9.4 of docs/canon/complexity-witness-canon.typ) and carrying none of its events: the log itself stays on the phone until it goes home (some-ui #1934), never here. For each: the session file (`file`), the `form` (full, or short: one incident and its take), when it started, and how it `ended` (\"declared\": it reached its end; \"left\": the learner left at a round boundary; null: neither yet). `rounds` are the rounds first picked in that session, each with its whole funnel so far, later sessions included: the first `picked` answer (correct, incorrect or abstained), whether that was a struggle (`struggled`: not correct, or slow), the readings `placed` for it after a struggle, what was done with them (`reading`: opened, saved, read or skipped, each with its reading), the returns played (`returned`, each answer with whether it was slow and whether it was `assisted`: the round's answer was shown since its last struggle, by a take's rubric, the round's worked confirmation, or the reveal of a correct, unhurried pick or return of it), and whether the round is `solved`: a correct, unhurried pick, or such a return unassisted, since its last struggle, replays included (as the phone's end screen counts parked rounds, except that an assisted return takes a round off the end screen and is still unsolved here, and a struggle left on its reveal when the app closed is unsolved here). `replays` are rounds played again after their first pick; a replay's own answer changes nothing, and the readings and returns after it join the round's funnel. `spoken` lists the spoken answers: passed, recorded or typed, and `strong` when the ticks reached what the screen asks. Null means the app could not read the log."

const LEETYPE_ROUND_LEDGER =
  "`leetypeRoundLedger` is what an earlier build kept about Def. 1.7 rounds (the round ledger, retired with those rounds in some-ui #1941), exactly as stored and still on the phone so that it is not lost; null when the phone holds none or could not read it."

const STOPS =
  '`stops` are the times a session was stopped before its end, each with when (`stoppedAt`), how far in (`elapsedMs` of `plannedMs`, in `scene`), `via` a tap on "Got to go" or leaving (`left`: the app went to the background, or Android\'s back button or a link in the app closed the session\'s screen), the optional `reason` (`legend` reads it) and where it was given (`reasonFrom`), and `outcome` (open, resumed, done or lapsed, as of `settledAt`). Not every departure is a stop: one the learner was back from within a minute (a glance), and a tap taken back before leaving ("Oops, keep going"), are deleted, and `paths` counts them instead. Only the newest 20 stops are kept, so an older session can show none.'

const PATHS =
  '`paths` counts, for one session, what the stops cannot show: `opens`, how many times the session\'s screen opened while it was unfinished, the first time included (more than one means it was left and reopened); `glances`, departures the learner was back from within a minute; `takenBack`, "Got to go" taps taken back before leaving ("Oops, keep going"); and `pickUps`, stops picked up again (each also reads `resumed` while its stop is kept). They are counted from the first app version that counted them, and kept for the 20 sessions counted most recently; null means none were counted for that session, or it was dropped for 20 newer ones. A departure the app could not see (the app crashing while on screen) leaves no stop and no glance, only one more `opens` once the session is reopened, and it then starts from the beginning.'

const ABOUT = [
  "Exported from the some-ui study app on the learner's phone, for an agent helping them.",
  "Use it to answer two questions:",
  "1. How should the next lesson be shaped, given the sessions, how they went (each session's reflections) and why they stopped early (stops)?",
  "2. Where does the app get in the way on the phone: friction, blockers, anything that kept a session from happening or finishing? Soundbites are the learner speaking, often about exactly that.",
  "Each soundbite's and voice reflection's audio is a separate file, named in its `file`; a soundbite's `context.source` says what the learner tapped to record it.",
  STOPS,
  PATHS,
  "A deleted session's counts, still on the phone, are in `pathsWithoutSession`.",
  READ_ALOUD_PRACTICE,
  READ_ALOUD_FEEDBACK,
  GRAMMAR_LENS,
  LENS_TAKES,
  LEETYPE_ANSWERS,
  LEETYPE_SESSIONS,
  LEETYPE_ROUND_LEDGER,
].join("\n")

function soundbiteFile(bite: Soundbite): string {
  return `soundbite-${bite.id}.${extensionOf(bite.mimeType)}`
}

/**
 * The take's file, named for its line, cut short: a line id has no length
 * bound, and a name past the filesystem's would fail the whole share.
 * `context.json` carries the full id.
 */
function lensTakeFile(take: LensTake): string {
  const line = take.line.slice(0, 48)
  return `lens-take-${line}-${take.id.slice(0, 8)}.${extensionOf(take.mimeType)}`
}

/** A LeetType take's file, named as a lens take's is: its prompt, cut short. */
function leetypeTakeFile(take: LeetypeTake): string {
  const about = take.line.replace(/[^\w.-]+/g, "-").slice(0, 48)
  return `leetype-take-${about}-${take.id.slice(0, 8)}.${extensionOf(take.mimeType)}`
}

/** Without `scenes` and `layout`: playback wiring, not what was studied. */
function summary(
  session: SessionRecord
): Omit<SessionRecord, "scenes" | "layout"> {
  const { scenes: _scenes, layout: _layout, ...rest } = session
  return rest
}

/** `2026-10-10_morning-drama_s-7f3a91`: findable in a folder of them. */
function reflectionsBase(
  sessionId: string,
  session: SessionRecord | undefined,
  fallbackDate: string
): string {
  const date = (
    session?.completedAt ??
    session?.updatedAt ??
    fallbackDate
  ).slice(0, 10)
  const name = (session?.name ?? "session")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
  return `${date}_${name || "session"}_${sessionId.slice(0, 8)}`
}

/** A voice note's file, named for where in the session it was said. */
function voiceFile(
  base: string,
  reflection: Reflection,
  mimeType: string
): string {
  const at =
    reflection.atMs === null
      ? "after"
      : `${String(Math.floor(reflection.atMs / 60_000)).padStart(2, "0")}m${String(
          Math.floor(reflection.atMs / 1000) % 60
        ).padStart(2, "0")}s`
  return `${base}_voice-${at}-${reflection.id.slice(0, 6)}.${extensionOf(mimeType)}`
}

/** One reflection as written out; `file` only for a voice note with its audio. */
function written(
  reflection: Reflection,
  file: string | null
): Record<string, unknown> {
  const { body, ...rest } = reflection
  return body.kind === "voice"
    ? { ...rest, ...body, file }
    : { ...rest, ...body }
}

type Written = {
  /** Each session's reflections as written out, by session ID. */
  bySession: Map<
    string,
    { base: string; entries: Array<Record<string, unknown>> }
  >
  /** The voice notes' audio, named as their entries say. */
  files: Array<SharedFile>
  /** The reflections that went out whole: the ones a hand-off may let go. */
  sent: Array<string>
}

/**
 * `kept` as written out, per session, with the voice notes' audio beside
 * them. A voice note whose audio is gone is written with `file: null`; one
 * whose audio could not be read, or is still being saved, is left out and
 * stays on the phone, so a hand-off never lets go of what did not go out.
 */
async function writeOut(
  kept: ReadonlyArray<Reflection>,
  sessions: ReadonlyArray<SessionRecord>,
  exportedAt: string
): Promise<Written> {
  const out: Written = { bySession: new Map(), files: [], sent: [] }
  for (const reflection of inOrder(kept)) {
    const { sessionId } = reflection
    let group = out.bySession.get(sessionId)
    if (!group) {
      group = {
        base: reflectionsBase(
          sessionId,
          sessions.find((s) => s.id === sessionId),
          exportedAt
        ),
        entries: [],
      }
      out.bySession.set(sessionId, group)
    }
    let file: string | null = null
    if (reflection.body.kind === "voice") {
      if (isSaving(reflection.id)) continue
      let audio: Blob | null
      try {
        audio = await reflectionAudio().get(reflection.id)
      } catch {
        continue
      }
      if (audio !== null) {
        file = voiceFile(group.base, reflection, reflection.body.mimeType)
        out.files.push({ name: file, data: audio })
      }
    }
    group.entries.push(written(reflection, file))
    out.sent.push(reflection.id)
  }
  return out
}

/**
 * The read-aloud practice record, loaded only when a share asks for it so
 * the applet stays out of the main bundle; null if it can't be.
 */
async function readAloudPractice(): Promise<PracticeRecord | null> {
  try {
    const { readAloudPracticeRecord } = await import("@some-ui/topik")
    return readAloudPracticeRecord()
  } catch {
    return null
  }
}

async function readAloudFeedback(): Promise<ReadAloudFeedback | null> {
  try {
    const { readAloudFeedbackForExport } = await import("@some-ui/topik")
    return readAloudFeedbackForExport()
  } catch {
    return null
  }
}

/** The learner's takes of lens lines, with their audio; null if unreadable. */
async function lensTakes(): Promise<Array<{
  take: LensTake
  audio: Blob | null
  read: boolean
}> | null> {
  try {
    return await lensTakesForExport()
  } catch {
    return null
  }
}

/** LeetType's answer notes and takes, with the takes' audio; null if unreadable. */
async function leetypeTakes(): Promise<Awaited<
  ReturnType<typeof leetypeTakesForExport>
> | null> {
  try {
    return await leetypeTakesForExport()
  } catch {
    return null
  }
}

/** How each LeetType session went, from the phone's session log; null if unreadable. */
async function leetypeSessions(): Promise<Array<SessionSummary> | null> {
  try {
    const { createSessionLogStore, summariesOf } = await import(
      "@some-ui/leetype"
    )
    const store = createSessionLogStore()
    return store.readOnly ? null : summariesOf(store.getSnapshot().log)
  } catch {
    return null
  }
}

const ROUND_LEDGER_KEY = "leetype:ledger"

/** The retired round ledger's stored value, as stored, so it is not lost (#1941). */
function leetypeRoundLedger(): unknown {
  // Read whatever it holds: JSON as JSON, anything else as the text.
  return openKept<unknown>(
    localStorageOrNull(),
    ROUND_LEDGER_KEY,
    (raw) => {
      const stored = jsonOf(raw)
      return { value: stored === undefined ? raw : stored, whole: true }
    },
    null
  ).value
}

/** The grammar lens's record, loaded as the practice record is; null if it can't be. */
async function grammarLens(): Promise<LensRecordExport | null> {
  try {
    const { lensRecordForExport } = await import("@some-ui/topik")
    return lensRecordForExport()
  } catch {
    return null
  }
}

function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * What a share put in front of the share sheet. `shared` is only what the
 * sheet says: Android reports it once the person picks an app, even if they
 * then back out of it, so the sessions of the reflections in `sent` read as
 * shared only once the person says they arrived (`handOff`).
 */
type ShareResult = {
  outcome: "shared" | "cancelled"
  sent: ReadonlyArray<string>
}

/**
 * What the whole export put in front of the share sheet: `soundbites` are
 * those that went out, `lens` the grammar-lens entries, `takes` the
 * grammar-lens takes and `leetype` LeetType's answer notes and takes, so
 * the question after it can say what went.
 */
export type AgentExportResult = ShareResult & {
  soundbites: ReadonlyArray<string>
  lens: LensRecordExport["entries"]
  takes: ReadonlyArray<string>
  leetype: {
    notes: ReadonlyArray<string>
    takes: ReadonlyArray<string>
  }
}

/** The person says these arrived: their sessions read as shared. */
export function handOff(ids: ReadonlyArray<string>, at = new Date()): void {
  const sent = new Set(ids)
  const sessionIds = reflections
    .getSnapshot()
    .kept.filter((r) => sent.has(r.id))
    .map((r) => r.sessionId)
  if (sessionIds.length > 0) reflections.markShared(sessionIds, at)
}

/** Opens the share sheet with everything, reflections nested per session. */
export async function shareAgentExport(
  soundbites: SoundbiteReader,
  now: () => Date = () => new Date()
): Promise<AgentExportResult> {
  const audio = new Map<string, Blob>()
  const bites = await soundbites.list()
  for (const bite of bites) {
    const blob = await soundbites.audio(bite.id)
    if (blob) audio.set(bite.id, blob)
  }
  const sessions = await sessionsRepository.list()
  // The record before the takes: a take kept in between is then exported
  // without its count, and its entry, rewritten, differs from the one sent
  // and stays for the next export; the other way round, the entry would go
  // and the take would stay behind.
  const lens = await grammarLens()
  const takes = await lensTakes()
  const leetype = await leetypeTakes()
  const leetypeAudio = new Map(
    (leetype?.takes ?? []).flatMap(({ take, audio: blob }) =>
      blob ? [[take.id, leetypeTakeFile(take)] as const] : []
    )
  )
  const exportedAt = now().toISOString()
  const { bySession, files, sent } = await writeOut(
    reflections.getSnapshot().kept,
    sessions,
    exportedAt
  )
  const context = JSON.stringify(
    {
      about: ABOUT,
      exportedAt,
      timeZone: timeZone(),
      // How the codes below read on screen.
      legend: { reflectionQuestions: QUESTIONS, stopReasons: REASONS },
      sessions: sessions.map((session) => ({
        ...summary(session),
        reflections: bySession.get(session.id)?.entries ?? [],
        paths: pathCounts(session.id),
      })),
      // A deleted session's reflections, still on the phone until shared.
      reflectionsWithoutSession: [...bySession]
        .filter(([id]) => !sessions.some((s) => s.id === id))
        .flatMap(([sessionId, { entries }]) =>
          entries.map((entry) => ({ sessionId, ...entry }))
        ),
      pathsWithoutSession: allPathCounts().filter(
        (counts) => !sessions.some((s) => s.id === counts.sessionId)
      ),
      stops: allStops(),
      readAloudPractice: await readAloudPractice(),
      readAloudFeedback: await readAloudFeedback(),
      grammarLens: lens,
      lensTakes:
        takes?.map(({ take, audio: blob }) => ({
          ...take,
          file: blob ? lensTakeFile(take) : null,
        })) ?? null,
      leetypeAnswers:
        leetype?.notes.map((note: LeetypeTakeNote) => ({
          ...note,
          audio:
            note.take === null ? null : (leetypeAudio.get(note.take) ?? null),
        })) ?? null,
      leetypeTakes:
        leetype?.takes.map(({ take }) => ({
          ...take,
          audio: leetypeAudio.get(take.id) ?? null,
        })) ?? null,
      leetypeSessions: await leetypeSessions(),
      leetypeRoundLedger: leetypeRoundLedger(),
      // `file: null`: its audio could not be read (removed since listed).
      soundbites: bites.map((bite) => ({
        ...bite,
        file: audio.has(bite.id) ? soundbiteFile(bite) : null,
      })),
    },
    null,
    2
  )
  const outcome = await foreignValue({
    outcome: shareFiles("agent-export", "Study context for an agent", [
      { name: "context.json", data: context },
      ...bites.flatMap((bite) => {
        const blob = audio.get(bite.id)
        return blob ? [{ name: soundbiteFile(bite), data: blob }] : []
      }),
      ...(takes ?? []).flatMap(({ take, audio: blob }) =>
        blob ? [{ name: lensTakeFile(take), data: blob }] : []
      ),
      ...(leetype?.takes ?? []).flatMap(({ take, audio: blob }) =>
        blob ? [{ name: leetypeTakeFile(take), data: blob }] : []
      ),
      ...files,
    ]),
  })
  // Every bite listed went out: its audio beside it, or `file: null` for
  // audio already gone.
  return {
    outcome,
    sent,
    soundbites: bites.map((bite) => bite.id),
    lens: lens?.entries ?? [],
    // Likewise every take listed, but never one whose audio could not be
    // read, which may still be on the phone, unsent.
    takes: (takes ?? []).flatMap(({ take, read }) => (read ? [take.id] : [])),
    leetype: {
      notes: (leetype?.notes ?? []).map(({ id }) => id),
      takes: (leetype?.takes ?? []).flatMap(({ take, read }) =>
        read ? [take.id] : []
      ),
    },
  }
}
