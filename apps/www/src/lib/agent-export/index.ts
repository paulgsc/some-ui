/**
 * What the phone knows about how studying is going, as files for an agent
 * (Claude, ChatGPT) to read, handed to Android's share sheet so the person
 * picks where they go (Drive, say); nothing here sends anything anywhere.
 *
 * Two shares. `shareAgentExport` is everything: one `context.json` (sessions,
 * each with its reflections, stops and soundbites) and every recording beside
 * it. `shareReflections` is the reflections of the sessions named, one file
 * per session named for it, each voice note beside its file. Either way, the
 * reflections that went out leave the phone (`lib/session-reflection`): they
 * are for the agent to act on, not for the phone to keep.
 *
 * Phone-only: rendered only in the device build, so no other profile ships it
 * (`build.paths.ts`).
 */
import type { Soundbite, SoundbiteStore } from "@some-ui/soundbites"

import { foreignValue } from "@/lib/intent/foreign"
import { letGoReflections, reflectionAudio } from "@/lib/reflection-voice"
import type { Reflection } from "@/lib/session-reflection"
import { inOrder, QUESTIONS, reflections } from "@/lib/session-reflection"
import { allStops, REASONS } from "@/lib/session-stop"
import { shareFiles } from "@/lib/share-files"
import type { SessionRecord } from "@/lib/tenant"
import { sessionsRepository } from "@/lib/tenant/queries"

type SoundbiteReader = Pick<SoundbiteStore, "list" | "audio">

type File = { name: string; data: string | Blob }

const ABOUT = [
  "Exported from the some-ui study app on the learner's phone, for an agent helping them.",
  "Use it to answer two questions:",
  "1. How should the next lesson be shaped, given the sessions, how they went (each session's reflections) and why they stopped early (stops)?",
  "2. Where does the app get in the way on the phone: friction, blockers, anything that kept a session from happening or finishing? Soundbites are the learner speaking, often about exactly that.",
  "Each soundbite's and voice reflection's audio is a separate file, named in its `file`; a soundbite's `context.source` says what the learner tapped to record it.",
].join("\n")

const ABOUT_REFLECTIONS = [
  "Reflections from the some-ui study app on the learner's phone, about one study session, for an agent helping them.",
  "Each is something the learner said while it was fresh: a typed line, a voice note (its audio is the file named in `file`), or one-tap answers (`legend` reads them).",
  "`atMs` is how far into the session it was said; null means after the session ended.",
  "Use them to shape the next session. They have left the phone: this file is the only copy.",
].join("\n")

/** `audio/webm;codecs=opus` -> `webm`. */
function extensionOf(mimeType: string): string {
  return mimeType.split(/[/;]/)[1] ?? "bin"
}

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

/**
 * The given reflections as written out, with the audio files beside them.
 * A voice note whose audio is gone is written with `file: null`.
 */
async function withAudio(
  base: string,
  kept: ReadonlyArray<Reflection>
): Promise<{ entries: Array<Record<string, unknown>>; files: Array<File> }> {
  const entries: Array<Record<string, unknown>> = []
  const files: Array<File> = []
  for (const reflection of inOrder(kept)) {
    if (reflection.body.kind !== "voice") {
      entries.push(written(reflection, null))
      continue
    }
    const audio = await reflectionAudio()
      .get(reflection.id)
      .catch(() => null)
    const name =
      audio === null
        ? null
        : voiceFile(base, reflection, reflection.body.mimeType)
    if (audio !== null && name !== null) files.push({ name, data: audio })
    entries.push(written(reflection, name))
  }
  return { entries, files }
}

function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** After the sheet says shared: those reflections leave the phone. */
function handedOff(
  kept: ReadonlyArray<Reflection>,
  outcome: "shared" | "cancelled",
  at: Date
): void {
  if (outcome !== "shared" || kept.length === 0) return
  letGoReflections(kept.map((r) => r.id))
  reflections.markShared(
    kept.map((r) => r.sessionId),
    at
  )
}

/**
 * Shares the reflections of `sessionIds`, one file per session, and lets
 * them go once the share sheet says they were shared.
 */
export async function shareReflections(
  sessionIds: ReadonlyArray<string>,
  now: () => Date = () => new Date()
): Promise<"shared" | "cancelled"> {
  const wanted = new Set(sessionIds)
  const kept = reflections
    .getSnapshot()
    .kept.filter((r) => wanted.has(r.sessionId))
  const sessions = await sessionsRepository.list()
  const exportedAt = now().toISOString()
  const files: Array<File> = []
  for (const sessionId of wanted) {
    const own = kept.filter((r) => r.sessionId === sessionId)
    if (own.length === 0) continue
    const session = sessions.find((s) => s.id === sessionId)
    const base = reflectionsBase(sessionId, session, exportedAt)
    const { entries, files: audio } = await withAudio(base, own)
    files.push(
      {
        name: `${base}.json`,
        data: JSON.stringify(
          {
            about: ABOUT_REFLECTIONS,
            exportedAt,
            timeZone: timeZone(),
            legend: { reflectionQuestions: QUESTIONS },
            session: session ? summary(session) : { id: sessionId },
            reflections: entries,
          },
          null,
          2
        ),
      },
      ...audio
    )
  }
  const outcome = await foreignValue({
    outcome: shareFiles("reflections", "Study session reflections", files),
  })
  handedOff(kept, outcome, now())
  return outcome
}

/** Opens the share sheet with everything, reflections nested per session. */
export async function shareAgentExport(
  soundbites: SoundbiteReader,
  now: () => Date = () => new Date()
): Promise<void> {
  const audio = new Map<string, Blob>()
  const bites = await soundbites.list()
  for (const bite of bites) {
    const blob = await soundbites.audio(bite.id)
    if (blob) audio.set(bite.id, blob)
  }
  const sessions = await sessionsRepository.list()
  const kept = reflections.getSnapshot().kept
  const exportedAt = now().toISOString()
  const files: Array<File> = []
  const nested = new Map<string, Array<Record<string, unknown>>>()
  for (const sessionId of new Set(kept.map((r) => r.sessionId))) {
    const base = reflectionsBase(
      sessionId,
      sessions.find((s) => s.id === sessionId),
      exportedAt
    )
    const { entries, files: voice } = await withAudio(
      base,
      kept.filter((r) => r.sessionId === sessionId)
    )
    nested.set(sessionId, entries)
    files.push(...voice)
  }
  const context = JSON.stringify(
    {
      about: ABOUT,
      exportedAt,
      timeZone: timeZone(),
      // How the codes below read on screen.
      legend: { reflectionQuestions: QUESTIONS, stopReasons: REASONS },
      sessions: sessions.map((session) => ({
        ...summary(session),
        reflections: nested.get(session.id) ?? [],
      })),
      // A deleted session's reflections, still on the phone until shared.
      reflectionsWithoutSession: [...nested]
        .filter(([id]) => !sessions.some((s) => s.id === id))
        .flatMap(([sessionId, entries]) =>
          entries.map((entry) => ({ sessionId, ...entry }))
        ),
      stops: allStops(),
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
  handedOff(kept, outcome, now())
}
