/**
 * What the phone knows about how studying is going, as files for an agent
 * (Claude, ChatGPT) to read: one `context.json` and each soundbite's audio
 * beside it. Handed to Android's share sheet, so the person picks where it
 * goes (Drive, say); nothing here sends anything anywhere.
 *
 * `buildAgentContext` is pure. Phone-only: its page renders it only in the
 * device build, so no other profile ships it (`build.paths.ts`).
 */
import type { Soundbite, SoundbiteStore } from "@some-ui/soundbites"

import { foreignValue } from "@/lib/intent/foreign"
import { allReflections, QUESTIONS } from "@/lib/session-reflection"
import type { Reflection } from "@/lib/session-reflection"
import { allStops, REASONS } from "@/lib/session-stop"
import type { Stop } from "@/lib/session-stop"
import { shareFiles } from "@/lib/share-files"
import type { SessionRecord } from "@/lib/tenant"
import { sessionsRepository } from "@/lib/tenant/queries"

type SoundbiteReader = Pick<SoundbiteStore, "list" | "audio">

const ABOUT = [
  "Exported from the some-ui study app on the learner's phone, for an agent helping them.",
  "Use it to answer two questions:",
  "1. How should the next lesson be shaped, given the sessions, how they went (reflections) and why they stopped early (stops)?",
  "2. Where does the app get in the way on the phone: friction, blockers, anything that kept a session from happening or finishing? Soundbites are the learner speaking, often about exactly that.",
  "Each soundbite's audio is a separate file named in `soundbites[].file`; its `context.source` says what the learner tapped to record it.",
].join("\n")

/** `audio/webm;codecs=opus` -> `soundbite-<id>.webm`. */
function soundbiteFile(bite: Soundbite): string {
  const extension = bite.mimeType.split(/[/;]/)[1] ?? "bin"
  return `soundbite-${bite.id}.${extension}`
}

function buildAgentContext(input: {
  exportedAt: string
  timeZone: string
  sessions: ReadonlyArray<SessionRecord>
  reflections: ReadonlyArray<{ sessionId: string; answers: Reflection }>
  stops: ReadonlyArray<Stop>
  soundbites: ReadonlyArray<{ bite: Soundbite; withAudio: boolean }>
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

/** Opens the share sheet with the bundle. */
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
  await foreignValue({
    outcome: shareFiles("agent-export", "Study context for an agent", [
      { name: "context.json", data: context },
      ...bites.flatMap((bite) => {
        const blob = audio.get(bite.id)
        return blob ? [{ name: soundbiteFile(bite), data: blob }] : []
      }),
    ]),
  })
}
