/**
 * What the phone knows about how studying is going, as files for an agent
 * (Claude, ChatGPT) to read: one `context.json` and each soundbite's audio
 * beside it. Handed to Android's share sheet, so the person picks where it
 * goes (Drive, say); nothing here sends anything anywhere.
 *
 * The bundle answers two questions, stated in the file for its reader: how
 * to shape the next lesson, and where the app gets in the way of studying.
 * Until the home server can take soundbites and an agent can reach it, this
 * is how they leave the phone (`apps/mobile/README.md`, "Soundbites").
 *
 * `buildAgentContext` is pure; `shareAgentExport` writes the files to the
 * app's cache and opens the sheet, through `@capacitor/filesystem` and
 * `@capacitor/share`, each wait in a `callForeign` (F1).
 */
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem"
import { Share } from "@capacitor/share"
import type {
  ForeignCall,
  ForeignVerdict,
  IntentError,
} from "@some-ui/intent-kit"
import {
  callForeign,
  ForeignDeadlineError,
  reportFailure,
} from "@some-ui/intent-kit"

import { mapFileHostError } from "@/lib/intent/errors"
import { allReflections, QUESTIONS } from "@/lib/session-reflection"
import type { Reflection } from "@/lib/session-reflection"
import { allStops, REASONS } from "@/lib/session-stop"
import type { Stop } from "@/lib/session-stop"
import type { SessionRecord } from "@/lib/tenant"
import { sessionsRepository } from "@/lib/tenant/queries"

/** A soundbite's metadata as `@some-ui/soundbites` keeps it. */
type SoundbiteMeta = { id: string; mimeType: string }

/** The soundbite store's read side (`@some-ui/soundbites`), passed in by its page. */
export type SoundbiteReader = {
  list: () => Promise<Array<SoundbiteMeta>>
  audio: (id: string) => Promise<Blob | null>
}

const ABOUT = [
  "Exported from the some-ui study app on the learner's phone, for an agent helping them.",
  "Use it to answer two questions:",
  "1. How should the next lesson be shaped, given the sessions, how they went (reflections) and why they stopped early (stops)?",
  "2. Where does the app get in the way on the phone: friction, blockers, anything that kept a session from happening or finishing? Soundbites are the learner speaking, often about exactly that.",
  "Each soundbite's audio is a separate file named in `soundbites[].file`; its `context.source` says what the learner tapped to record it.",
].join("\n")

/** `audio/webm;codecs=opus` -> `soundbite-<id>.webm`. */
function soundbiteFile(bite: SoundbiteMeta): string {
  const extension = bite.mimeType.split(/[/;]/)[1] ?? "bin"
  return `soundbite-${bite.id}.${extension}`
}

function buildAgentContext(input: {
  exportedAt: string
  timeZone: string
  sessions: ReadonlyArray<SessionRecord>
  reflections: ReadonlyArray<{ sessionId: string; answers: Reflection }>
  stops: ReadonlyArray<Stop>
  /** `withAudio`: whether its audio is among the shared files. */
  soundbites: ReadonlyArray<{ bite: SoundbiteMeta; withAudio: boolean }>
}): string {
  return JSON.stringify(
    {
      about: ABOUT,
      exportedAt: input.exportedAt,
      timeZone: input.timeZone,
      // How the codes below read on screen.
      legend: { reflectionQuestions: QUESTIONS, stopReasons: REASONS },
      // Without `scenes` and `layout`: playback wiring, not what was studied.
      sessions: input.sessions.map(
        ({ scenes: _scenes, layout: _layout, ...session }) => session
      ),
      reflections: input.reflections,
      stops: input.stops,
      // `file: null`: its audio could not be read (removed since listed).
      soundbites: input.soundbites.map(({ bite, withAudio }) => ({
        ...bite,
        file: withAudio ? soundbiteFile(bite) : null,
      })),
    },
    null,
    2
  )
}

const DIR = "agent-export"

/** Writing the files: a few megabytes at most (`SOUNDBITES_MAX_BYTES`). */
const WRITE_DEADLINE_MS = 60_000
/** The share sheet waits on a person choosing where the files go. */
const SHARE_DEADLINE_MS = 10 * 60_000

/**
 * What the plugins' failures mean here. A Capacitor `code` of `UNAVAILABLE`
 * or `UNIMPLEMENTED` is no plugin in this build, which no retry changes.
 */
function classifyExport(error: unknown): ForeignVerdict {
  if (error instanceof ForeignDeadlineError) {
    return {
      kind: "unreachable",
      retryable: true,
      summary: "The phone didn't finish sharing. Try again.",
    }
  }
  const code: unknown =
    typeof error === "object" && error !== null
      ? Reflect.get(error, "code")
      : undefined
  return code === "UNAVAILABLE" || code === "UNIMPLEMENTED"
    ? {
        kind: "unavailable",
        retryable: false,
        summary: "Sharing isn't available in this build of the app.",
      }
    : {
        kind: "unknown",
        retryable: true,
        summary: "Couldn't share the files. Try again.",
      }
}

const PORT = {
  name: "agent export (filesystem, share sheet)",
  classify: classifyExport,
  report: reportFailure,
}

/** A failed foreign call, carrying what it means here. */
class AgentExportError extends Error {
  constructor(readonly intent: IntentError) {
    super(intent.summary)
    this.name = "AgentExportError"
  }
}

/**
 * `mapError` for the export's intent: a foreign failure as `classifyExport`
 * read it; reading the sessions fails as any `file_host` read does.
 */
export function agentExportError(error: unknown): IntentError {
  return error instanceof AgentExportError
    ? error.intent
    : mapFileHostError(error)
}

async function foreign<T>(call: ForeignCall<T>): Promise<T> {
  const outcome = await call.outcome
  if (outcome.status === "succeeded") return outcome.value
  if (outcome.status === "failed") throw new AgentExportError(outcome.error)
  // Nothing here abandons a call.
  throw new Error("agent export: a call was abandoned")
}

/** Base64 without the `data:` prefix, which is what `writeFile` takes for bytes. */
function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (): void =>
      resolve(String(reader.result).replace(/^[^,]*,/, ""))
    reader.onerror = (): void =>
      reject(reader.error ?? new Error("read failed"))
    reader.readAsDataURL(blob)
  })
}

/**
 * Writes the bundle to the app's cache and opens the share sheet. Backing
 * out of the sheet is not a failure. Each export replaces the last one's
 * files, so the cache holds at most one.
 */
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
  const context = buildAgentContext({
    exportedAt: now().toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    sessions: await sessionsRepository.list(),
    reflections: allReflections(),
    stops: allStops(),
    soundbites: bites.map((bite) => ({ bite, withAudio: audio.has(bite.id) })),
  })

  const files = await foreign(
    callForeign({
      port: PORT,
      deadlineMs: WRITE_DEADLINE_MS,
      start: async (): Promise<Array<string>> => {
        await Filesystem.rmdir({
          path: DIR,
          directory: Directory.Cache,
          recursive: true,
        }).catch(() => undefined)
        const write = async (
          name: string,
          data: string,
          utf8: boolean
        ): Promise<string> =>
          (
            await Filesystem.writeFile({
              path: `${DIR}/${name}`,
              directory: Directory.Cache,
              data,
              recursive: true,
              ...(utf8 ? { encoding: Encoding.UTF8 } : {}),
            })
          ).uri
        const uris = [await write("context.json", context, true)]
        for (const bite of bites) {
          const blob = audio.get(bite.id)
          if (blob)
            uris.push(
              await write(soundbiteFile(bite), await base64(blob), false)
            )
        }
        return uris
      },
    })
  )

  await foreign(
    callForeign({
      port: PORT,
      deadlineMs: SHARE_DEADLINE_MS,
      start: async (): Promise<void> => {
        try {
          await Share.share({ title: "Study context for an agent", files })
        } catch (error) {
          if (!(error instanceof Error && error.message === "Share canceled")) {
            throw error
          }
        }
      },
    })
  )
}
