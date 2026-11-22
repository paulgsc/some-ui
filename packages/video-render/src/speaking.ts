/**
 * Home's Kokoro speaker, asked for lines over HTTP from a node command: each
 * take said once, in parts small enough to be answered in bounded time
 * (`./speaker`'s SPK1), and kept in the folder's step cache by its model,
 * voice and words. The recorders (`apps/www/tests/record`) and `motion
 * walkthrough --speaker` share it.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"

import { TimedWordSchema } from "./cut-list"
import { BITEXACT, QUIET } from "./plan"
import type { RenderPolicy } from "./policy"
import { fail } from "./refused"
import type { Ports } from "./render"
import { SPEAKER_DEADLINE_MS, speakerChunks, speakScene } from "./speaker"
import type { SpeakerTake } from "./speaker"
import { keyOf, stepCache } from "./step-cache"
import type { StepCache } from "./step-cache"
import type { StillTake } from "./stills"

/** Where the cache of takes and ffmpeg steps is kept in a video's folder. */
export const STEPS = "cache/steps"

/** A take and each word said in it, as the speaker's `/timed` gives them. */
export const TimedSchema = z.object({
  audio: z.string().min(1),
  words: z.array(TimedWordSchema),
})

/**
 * One part of a scene said in `voice` by home's Kokoro speaker at `speaker`,
 * as a WAV: the same bytes for the same words and voice. With `timed`, each
 * word's place in it too (`/timed`), for the captions. Gives up when
 * `signal` aborts (`speakScene`'s deadline).
 */
async function said(
  speaker: string,
  text: string,
  voice: string,
  timed: boolean,
  signal: AbortSignal
): Promise<SpeakerTake> {
  const response = await fetch(new URL(timed ? "/timed" : "/say", speaker), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
    signal,
  })
  if (!response.ok)
    throw new Error(
      `it answered ${String(response.status)}: ${await response.text()}`
    )
  if (!timed)
    return { wav: new Uint8Array(await response.arrayBuffer()), words: null }
  const parsed = TimedSchema.safeParse(await response.json())
  if (!parsed.success) throw new Error("it gave no words with its take")
  return {
    wav: new Uint8Array(Buffer.from(parsed.data.audio, "base64")),
    words: parsed.data.words,
  }
}

/** The speaker's model, by its SHA-256: part of every take's key. */
async function speakerModel(speaker: string): Promise<string> {
  const response = await fetch(new URL("/health", speaker), {
    signal: AbortSignal.timeout(SPEAKER_DEADLINE_MS),
  }).catch((e: unknown) =>
    fail([
      `The speaker at ${speaker} couldn't be reached: ${e instanceof Error ? e.message : String(e)}`,
    ])
  )
  if (!response.ok)
    fail([`The speaker at ${speaker} answered ${String(response.status)}`])
  const health: unknown = await response.json()
  if (
    typeof health !== "object" ||
    health === null ||
    !("model" in health) ||
    typeof health.model !== "string"
  )
    fail([`The speaker at ${speaker} named no model`])
  return health.model
}

/** A cache warning, on its own line so the render worker can find it. */
export const warn = (line: string): void => {
  process.stderr.write(`cache warning: ${line}\n`)
}

/**
 * A step answered from the step cache, by the file it wrote: a resumed
 * render's log shows each step it did not redo (paulgsc/server#739). Home's
 * render worker keeps it in the log and counts only `scenes`, `recorded` and
 * `assembling`, so it moves no progress.
 */
export const hit = (what: string): void => {
  process.stdout.write(`cache hit: ${what}\n`)
}

/**
 * Scene `file`'s take in `root`: `<file>.wav`, and with `timed`
 * `<file>.words.json`, asked of the speaker unless `cache` holds them for
 * these words, this voice and this model.
 */
async function takeOf({
  speaker,
  model,
  voice,
  text,
  timed,
  root,
  file,
  cache,
  ports,
}: {
  readonly speaker: string
  readonly model: string
  readonly voice: string
  readonly text: string
  readonly timed: boolean
  readonly root: string
  readonly file: string
  readonly cache: StepCache
  readonly ports: Ports
}): Promise<StillTake> {
  const wav = join(root, `${file}.wav`)
  const kept = join(root, `${file}.words.json`)
  // A scene said in several parts (SPK1) is a different take from one said
  // whole, so its parts are in its key; a scene of one part keeps its key.
  const parts = speakerChunks(text)
  const chunks = parts.length === 1 ? {} : { parts }
  const key = keyOf({ take: 1, model, voice, text, ...chunks })
  const wordsKey = keyOf({ words: 1, model, voice, text, ...chunks })
  const cached =
    (await cache.get(key, ".wav", wav)) &&
    (!timed || (await cache.get(wordsKey, ".json", kept)))
  if (cached) {
    cache.hit(`${file}.wav`)
  } else {
    const spoken = await speakScene({
      scene: file,
      text,
      ask: (part, signal) => said(speaker, part, voice, timed, signal),
    })
    if (!spoken.ok) fail([`The speaker at ${speaker}: ${spoken.problem}`])
    const take = spoken.take
    await writeFile(wav, take.wav)
    await cache.put(key, ".wav", wav, `${file}.wav`)
    if (take.words) {
      await writeFile(kept, `${JSON.stringify(take.words)}\n`)
      await cache.put(wordsKey, ".json", kept, `${file}.words.json`)
    }
  }
  const facts = await ports.probe(`${file}.wav`)
  if (!facts) fail([`${file}.wav can't be read`])
  const words = timed
    ? TimedSchema.shape.words.parse(JSON.parse(await readFile(kept, "utf8")))
    : undefined
  return { ms: Math.round(facts.durationMs), ...(words ? { words } : {}) }
}

/** A line for home's speaker to say into `<file>.wav`, with its words when `timed`. */
type Line = {
  readonly file: string
  readonly text: string
  readonly voice: string
  readonly timed: boolean
}

/**
 * Home's Kokoro speaker at `speaker`, saying lines into `root`: each take
 * asked of it once, then kept in `root`'s step cache by its model, voice and
 * words (`takeOf`), within `policy`'s cache budget; `ports` (`nodePorts(root)`)
 * reads each take's length.
 */
export async function speakerOf(
  root: string,
  speaker: string,
  policy: RenderPolicy,
  ports: Ports
): Promise<(line: Line) => Promise<StillTake>> {
  await mkdir(root, { recursive: true })
  const cache = { ...stepCache(join(root, STEPS), policy, warn), hit }
  const model = await speakerModel(speaker)
  return (line) =>
    takeOf({
      speaker,
      model,
      voice: line.voice,
      text: line.text,
      timed: line.timed,
      root,
      file: line.file,
      cache,
      ports,
    })
}

/**
 * Each of `lines` said in order by home's speaker at `speaker` into `root`,
 * or none with no speaker, saying the progress home's board reads (#2899):
 * `scenes <n>` once, then `recorded <file>` per line, as `recordStills` does.
 */
export async function sayLines({
  root,
  ports,
  lines,
  speaker,
  policy,
  announce = true,
}: {
  readonly root: string
  /** `nodePorts(root)`: reads each take's length. */
  readonly ports: Ports
  readonly lines: ReadonlyArray<{
    readonly file: string
    readonly said: string
    readonly voice: string
  }>
  readonly speaker: string | null
  readonly policy: RenderPolicy
  /** Whether it says `scenes <n>` itself, as `recordStills`' `announce`. */
  readonly announce?: boolean
}): Promise<Array<StillTake | null>> {
  const say =
    speaker === null ? null : await speakerOf(root, speaker, policy, ports)
  const takes: Array<StillTake | null> = []
  if (announce) process.stdout.write(`scenes ${String(lines.length)}\n`)
  for (const line of lines) {
    takes.push(
      say === null
        ? null
        : await say({
            file: line.file,
            text: line.said,
            voice: line.voice,
            timed: true,
          })
    )
    process.stdout.write(`recorded ${line.file}\n`)
  }
  return takes
}

/**
 * How a laid line's silence after it is given: `after` its take ends, for
 * `ms`; or `until` `ms` from its own start, where the next line starts; or
 * none, the last.
 */
export type LaidPad =
  | { readonly kind: "after"; readonly ms: number }
  | { readonly kind: "until"; readonly ms: number }
  | null

/**
 * Lays `lines`' takes end to end into `out`, each followed by its pad, in
 * one ffmpeg call, bit-exact (VR1): the one join of per-line takes, the
 * cards essays' (`after`, a chapter's gap) and the walkthrough's (`until`,
 * a stop's lines at their places) alike. Answers the laid file's own length
 * in whole ms, which bounds a take whose lines' lengths were each rounded,
 * so a take never runs past its audio; refuses one ffmpeg can't lay or
 * ffprobe can't read.
 */
export async function layAudio(
  ports: Ports,
  lines: ReadonlyArray<{ readonly file: string; readonly pad: LaidPad }>,
  out: string
): Promise<number> {
  const inputs = lines.flatMap((line) => ["-i", line.file])
  const pads = lines.map((line, k) => {
    const into = `[p${String(k)}];`
    if (line.pad === null) return `[${String(k)}:a]anull${into}`
    const seconds = String(line.pad.ms / 1000)
    return line.pad.kind === "after"
      ? `[${String(k)}:a]apad=pad_dur=${seconds}${into}`
      : `[${String(k)}:a]apad=whole_dur=${seconds}${into}`
  })
  const filter = `${pads.join("")}${lines.map((_, k) => `[p${String(k)}]`).join("")}concat=n=${String(lines.length)}:v=0:a=1`
  const laid = await ports.ffmpeg({
    args: [...QUIET, ...inputs, "-filter_complex", filter, ...BITEXACT, out],
  })
  if (!laid.ok) fail([`${out} can't be laid:`, laid.stderr])
  const facts = await ports.probe(out)
  if (!facts) fail([`${out} can't be read`])
  return Math.floor(facts.durationMs)
}
