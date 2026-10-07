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
 * `@capacitor/share`.
 */
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem"
import { Share } from "@capacitor/share"

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
  sessions: ReadonlyArray<SessionRecord>
  reflections: ReadonlyArray<{ sessionId: string; answers: Reflection }>
  stops: ReadonlyArray<Stop>
  soundbites: ReadonlyArray<SoundbiteMeta>
}): string {
  return JSON.stringify(
    {
      about: ABOUT,
      exportedAt: input.exportedAt,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      // How the codes below read on screen.
      legend: { reflectionQuestions: QUESTIONS, stopReasons: REASONS },
      // Without `scenes` and `layout`: playback wiring, not what was studied.
      sessions: input.sessions.map(
        ({ scenes: _scenes, layout: _layout, ...session }) => session
      ),
      reflections: input.reflections,
      stops: input.stops,
      soundbites: input.soundbites.map((bite) => ({
        ...bite,
        file: soundbiteFile(bite),
      })),
    },
    null,
    2
  )
}

const DIR = "agent-export"

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
  const bites = await soundbites.list()
  const context = buildAgentContext({
    exportedAt: now().toISOString(),
    sessions: await sessionsRepository.list(),
    reflections: allReflections(),
    stops: allStops(),
    soundbites: bites,
  })

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
  const files = [await write("context.json", context, true)]
  for (const bite of bites) {
    const audio = await soundbites.audio(bite.id)
    if (audio)
      files.push(await write(soundbiteFile(bite), await base64(audio), false))
  }

  try {
    await Share.share({ title: "Study context for an agent", files })
  } catch (error) {
    if (!(error instanceof Error && error.message === "Share canceled")) {
      throw error
    }
  }
}
