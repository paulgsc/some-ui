/**
 * What the phone knows about how studying is going, as files for an agent
 * (Claude, ChatGPT) to read, handed to Android's share sheet so the person
 * picks where they go (Drive, say); nothing here sends anything anywhere.
 *
 * Two shares. `shareAgentExport` is everything: one `context.json` (sessions,
 * each with its reflections and path counts, stops, soundbites and the
 * read-aloud practice record) and every recording beside it.
 * `shareReflections` is the reflections of the sessions named, one file per
 * session named for it with that session's stops and path counts and the
 * practice record, each voice note beside its file. Either way, the
 * reflections that went out leave the phone once the person says they arrived
 * (`handOff`), and with the whole export so do its soundbites
 * (`handOffExport`): they are for the agent to act on, not for the phone to
 * keep.
 *
 * Phone-only: rendered only in the device build, so no other profile ships it
 * (`build.paths.ts`).
 */
import { extensionOf } from "@some-ui/core-utils"
import type { Soundbite, SoundbiteStore } from "@some-ui/soundbites"
import type { PracticeRecord } from "@some-ui/topik"

import { foreignValue } from "@/lib/intent/foreign"
import {
  isSaving,
  letGoReflections,
  reflectionAudio,
} from "@/lib/reflection-voice"
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
type SoundbiteRemover = Pick<SoundbiteStore, "remove">

const READ_ALOUD_PRACTICE =
  "`readAloudPractice` is the read-aloud drill's practice record: for each of the 60 most recent days that had any (a day without practice has no entry, and an old day stays until 60 newer ones replace it), and in `totals` for all time, the reps read to the end, the sets finished and the practice they are credited with (a nominal time per rep, not the clock). All zeros means nothing was recorded or the stored record could not be read, which the app cannot tell apart; null means the app could not load the drill at all."

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
].join("\n")

const ABOUT_REFLECTIONS = [
  "Reflections from the some-ui study app on the learner's phone, about one study session, for an agent helping them.",
  "Each is something the learner said while it was fresh: a typed line, a voice note (its audio is the file named in `file`), or one-tap answers (`legend` reads them).",
  "`atMs` is how far into the session it was said; null means after the session ended.",
  STOPS,
  PATHS,
  READ_ALOUD_PRACTICE,
  "Use them to shape the next session. Once handed off the reflections leave the phone (the stops, path counts and the practice record stay): this file is then their only copy.",
].join("\n")

function soundbiteFile(bite: Soundbite): string {
  return `soundbite-${bite.id}.${extensionOf(bite.mimeType)}`
}

/** Without `scenes` and `layout`: playback wiring, not what was studied. */
function summary(
  session: SessionRecord
): Omit<SessionRecord, "scenes" | "layout"> {
  const { scenes: _scenes, layout: _layout, ...rest } = session
  return rest
}

/**
 * `2026-10-10_morning-drama_7f3a91c2`: findable in a folder of them, and one
 * per session even when two sessions share a day and a name. Session IDs are
 * `session-<uuid>`, so the eight characters come from after the prefix.
 */
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
  return `${date}_${name || "session"}_${sessionId.replace(/^session-/, "").slice(0, 8)}`
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

function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * What a share put in front of the share sheet. `shared` is only what the
 * sheet says: Android reports it once the person picks an app, even if they
 * then back out of it, so the reflections in `sent` stay on the phone until
 * the person says they arrived (`handOff`).
 */
export type ShareResult = {
  outcome: "shared" | "cancelled"
  sent: ReadonlyArray<string>
}

/**
 * What the whole export put in front of the share sheet: `soundbites` are
 * those that went out, the only ones `handOffExport` may let go.
 */
export type AgentExportResult = ShareResult & {
  soundbites: ReadonlyArray<string>
}

type Sent = Pick<AgentExportResult, "sent" | "soundbites">

/**
 * The person says these arrived: they leave the phone, and their sessions
 * read as shared. If the phone would not store that, they stay unmarked.
 */
export function handOff(ids: ReadonlyArray<string>, at = new Date()): void {
  const gone = new Set(ids)
  const sessionIds = reflections
    .getSnapshot()
    .kept.filter((r) => gone.has(r.id))
    .map((r) => r.sessionId)
  if (letGoReflections(ids)) reflections.markShared(sessionIds, at)
}

/**
 * The person says the whole export arrived: its reflections leave the phone
 * (`handOff`), and so do the soundbites that went out; one recorded since
 * stays. Best effort: soundbites the store would not let go stay on the
 * list, where each one's delete still lets it go.
 */
export function handOffExport(
  store: SoundbiteRemover,
  { sent, soundbites }: Sent,
  at = new Date()
): void {
  if (sent.length > 0) handOff(sent, at)
  if (soundbites.length > 0) store.remove(soundbites).catch(() => undefined)
}

/** Shares the reflections of `sessionIds`, one file per session. */
export async function shareReflections(
  sessionIds: ReadonlyArray<string>,
  now: () => Date = () => new Date()
): Promise<ShareResult> {
  const wanted = new Set(sessionIds)
  const kept = reflections
    .getSnapshot()
    .kept.filter((r) => wanted.has(r.sessionId))
  const sessions = await sessionsRepository.list()
  const exportedAt = now().toISOString()
  const { bySession, files, sent } = await writeOut(kept, sessions, exportedAt)
  const practice = await readAloudPractice()
  const stops = allStops()
  const jsons = [...bySession].map(([sessionId, { base, entries }]) => {
    const session = sessions.find((s) => s.id === sessionId)
    return {
      name: `${base}.json`,
      data: JSON.stringify(
        {
          about: ABOUT_REFLECTIONS,
          exportedAt,
          timeZone: timeZone(),
          legend: { reflectionQuestions: QUESTIONS, stopReasons: REASONS },
          session: session ? summary(session) : { id: sessionId },
          reflections: entries,
          stops: stops.filter((stop) => stop.sessionId === sessionId),
          paths: pathCounts(sessionId),
          readAloudPractice: practice,
        },
        null,
        2
      ),
    }
  })
  const outcome = await foreignValue({
    outcome: shareFiles("reflections", "Study session reflections", [
      ...jsons,
      ...files,
    ]),
  })
  return { outcome, sent }
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
      ...files,
    ]),
  })
  // Every bite listed went out: its audio beside it, or `file: null` for
  // audio already gone, which leaves nothing on the phone worth keeping.
  return { outcome, sent, soundbites: bites.map((bite) => bite.id) }
}
