/**
 * What the phone knows about how studying is going, as files for an agent
 * (Claude, ChatGPT) to read, handed to Android's share sheet so the person
 * picks where they go (Drive, say); nothing here sends anything anywhere.
 *
 * Two shares. `shareAgentExport` is everything: one `context.json` (sessions,
 * each with its reflections, stops and soundbites) and every recording beside
 * it. `shareReflections` is the reflections of the sessions named, one file
 * per session named for it, each voice note beside its file. Either way, the
 * reflections that went out leave the phone once the person says they arrived
 * (`handOff`): they are for the agent to act on, not for the phone to keep.
 *
 * Phone-only: rendered only in the device build, so no other profile ships it
 * (`build.paths.ts`).
 */
import type { Soundbite, SoundbiteStore } from "@some-ui/soundbites"

import { foreignValue } from "@/lib/intent/foreign"
import {
  isSaving,
  letGoReflections,
  reflectionAudio,
} from "@/lib/reflection-voice"
import type { Reflection } from "@/lib/session-reflection"
import { inOrder, QUESTIONS, reflections } from "@/lib/session-reflection"
import { allStops, REASONS } from "@/lib/session-stop"
import type { SharedFile } from "@/lib/share-files"
import { shareFiles } from "@/lib/share-files"
import type { SessionRecord } from "@/lib/tenant"
import { sessionsRepository } from "@/lib/tenant/queries"

type SoundbiteReader = Pick<SoundbiteStore, "list" | "audio">

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
  "Use them to shape the next session. Once handed off they leave the phone: this file is then the only copy.",
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

/** The person says these arrived: they leave the phone. */
export function handOff(ids: ReadonlyArray<string>, at = new Date()): void {
  const gone = new Set(ids)
  const sessionIds = reflections
    .getSnapshot()
    .kept.filter((r) => gone.has(r.id))
    .map((r) => r.sessionId)
  letGoReflections(ids)
  reflections.markShared(sessionIds, at)
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
  const jsons = [...bySession].map(([sessionId, { base, entries }]) => {
    const session = sessions.find((s) => s.id === sessionId)
    return {
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
): Promise<ShareResult> {
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
      })),
      // A deleted session's reflections, still on the phone until shared.
      reflectionsWithoutSession: [...bySession]
        .filter(([id]) => !sessions.some((s) => s.id === id))
        .flatMap(([sessionId, { entries }]) =>
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
  return { outcome, sent }
}
