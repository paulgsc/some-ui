/**
 * What leaves the phone when soundbites are shared: each recording's audio
 * under a name that says when it was said, and one notes file that says what
 * the recordings are and what the app noted around each. The notes are for
 * whoever, or whatever agent, is handed the files: audio alone does not say
 * that it is someone explaining a skipped session, nor when, nor after what.
 *
 * Pure: names and text only. Writing the files and opening the share sheet
 * is the phone's port (`phone.ts`), run by `runtime.ts`.
 */
import { formatDuration } from "./format"
import type { Soundbite, SoundbiteSource } from "./types"

/** One file handed to the share sheet. */
type SharedFile = {
  readonly name: string
  readonly mimeType: string
  readonly data: Blob
}

export type SoundbiteShare = {
  /** The subject line, where the target has one (an email, say). */
  readonly title: string
  readonly files: ReadonlyArray<SharedFile>
}

/**
 * "shared" once the person picked where it goes; "cancelled" when they
 * backed out of the share sheet. Anything else is a rejection.
 */
export type ShareOutcome = "shared" | "cancelled"

export type ShareSoundbites = (share: SoundbiteShare) => Promise<ShareOutcome>

export const NOTES_FILE = "soundbites.md"

const EXTENSIONS: ReadonlyArray<readonly [string, string]> = [
  ["audio/webm", "webm"],
  ["audio/ogg", "ogg"],
  ["audio/mp4", "m4a"],
  ["audio/mpeg", "mp3"],
  ["audio/wav", "wav"],
]

/** The file extension for what `MediaRecorder` produced, `bin` if unknown. */
function extensionFor(mimeType: string): string {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? ""
  return EXTENSIONS.find(([type]) => type === base)?.[1] ?? "bin"
}

/**
 * `soundbite-20261002T210400Z-1a2b3c4d.webm`: sorts by when it was said, and
 * the id's head keeps two from the same second apart.
 */
export function audioFileName(bite: Soundbite): string {
  const stamp = bite.recordedAt.replace(/[-:]/g, "").replace(/\.\d+/, "")
  return `soundbite-${stamp}-${bite.id.slice(0, 8)}.${extensionFor(bite.mimeType)}`
}

const SOURCE_WORDS: Record<SoundbiteSource, string> = {
  sessions: 'the "Not today? Say why" button on the sessions list',
  reminder: 'the "Not today" action on a study reminder notification',
  direct: "the soundbites page, opened on purpose",
}

/** `Fri, Oct 2, 17:04` in the phone's time zone, or null if it has none. */
function localTime(iso: string, timeZone: string): string | null {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
  } catch {
    return null
  }
}

function sinceLastSession(bite: Soundbite): string {
  const { lastSessionAt } = bite.context
  if (lastSessionAt === null) return "none yet"
  const hours = Math.floor(
    (Date.parse(bite.recordedAt) - Date.parse(lastSessionAt)) / 3_600_000
  )
  const ago =
    hours < 24
      ? `${Math.max(0, hours)} h`
      : `${Math.floor(hours / 24)} day${hours < 48 ? "" : "s"}`
  return `${lastSessionAt} (${ago} before this)`
}

/**
 * The notes file: what these recordings are, then one section per file with
 * what the app noted when it was kept.
 */
export function shareNotes(bites: ReadonlyArray<Soundbite>): string {
  const sections = bites.map((bite) => {
    const { context } = bite
    const local = localTime(bite.recordedAt, context.timeZone)
    return [
      `## ${audioFileName(bite)}`,
      "",
      `- Recorded: ${bite.recordedAt}${local === null ? "" : ` (${local}, ${context.timeZone})`}`,
      `- Length: ${formatDuration(bite.durationMs)}`,
      `- Opened from: ${SOURCE_WORDS[context.source]}`,
      `- Last session activity: ${sinceLastSession(bite)}`,
      `- Sessions open (started, not finished): ${context.openSessions}`,
      `- Audio: ${bite.mimeType}, ${bite.bytes} bytes`,
    ].join("\n")
  })
  return [
    "# Soundbites from Some UI",
    "",
    "Each recording is the app's user saying, out loud and in a minute or",
    "less, why a study session did not happen. The app (sessions of TOPIK",
    "reading and Leetype practice, on an Android phone) asks for nothing but",
    "the recording; everything listed under each one, it noted by itself",
    "when the recording was kept. Read them for what got in the way, and for what in the app",
    "could make that smaller.",
    "",
    ...sections.flatMap((section) => [section, ""]),
  ].join("\n")
}

/** Each soundbite's audio and the notes on all of them, ready to send. */
export function soundbiteShare(
  kept: ReadonlyArray<{ readonly bite: Soundbite; readonly audio: Blob }>
): SoundbiteShare {
  const bites = kept.map(({ bite }) => bite)
  return {
    title:
      bites.length === 1
        ? "A soundbite from Some UI"
        : `${bites.length} soundbites from Some UI`,
    files: [
      ...kept.map(({ bite, audio }) => ({
        name: audioFileName(bite),
        mimeType: bite.mimeType,
        data: audio,
      })),
      {
        name: NOTES_FILE,
        mimeType: "text/markdown",
        data: new Blob([shareNotes(bites)], { type: "text/markdown" }),
      },
    ],
  }
}
