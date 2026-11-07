/**
 * What every voiced feed's recorder shares (FEED3 #2646): home's Kokoro
 * speaker, a scene's take kept between attempts, and the policy flags. The
 * weekly call's recorder (`call.ts`) and Playoff Delta's (`playoff-delta.ts`)
 * both say their scenes through it.
 *
 * A take is keyed by the speaker's model, the voice and the words, so a
 * retry asks the speaker only for what changed; with `timed`, each word's
 * place in it (`/timed`, for subtitles) is kept beside it.
 */

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { DEFAULT_POLICY, MB, TimedWordSchema } from "@some-ui/video-render"
import type {
  Ports,
  RenderPolicy,
  StillTake,
  TimedWord,
} from "@some-ui/video-render"
import { keyOf, readSeries } from "@some-ui/video-render/node"
import type { StepCache } from "@some-ui/video-render/node"
import { z } from "zod"

import { fail, here } from "./command"

/** A take and each word said in it, as the speaker's `/timed` gives them. */
const TimedSchema = z.object({
  audio: z.string().min(1),
  words: z.array(TimedWordSchema),
})

/**
 * `text` said in `voice` by home's Kokoro speaker at `speaker`, as a WAV: the
 * same bytes for the same words and voice. With `timed`, each word's place
 * in it too (`/timed`), for the subtitles.
 */
async function said(
  speaker: string,
  text: string,
  voice: string,
  timed: boolean
): Promise<{ wav: Buffer; words: ReadonlyArray<TimedWord> | null }> {
  const response = await fetch(new URL(timed ? "/timed" : "/say", speaker), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  })
  if (!response.ok)
    fail([
      `The speaker at ${speaker} answered ${String(response.status)}: ${await response.text()}`,
    ])
  if (!timed)
    return { wav: Buffer.from(await response.arrayBuffer()), words: null }
  const parsed = TimedSchema.safeParse(await response.json())
  if (!parsed.success)
    fail([`The speaker at ${speaker} gave no words with its take`])
  return {
    wav: Buffer.from(parsed.data.audio, "base64"),
    words: parsed.data.words,
  }
}

/** The speaker's model, by its SHA-256: part of every take's key. */
export async function speakerModel(speaker: string): Promise<string> {
  const response = await fetch(new URL("/health", speaker))
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
 * Scene `file`'s take in `root`: `<file>.wav`, and with `timed`
 * `<file>.words.json`, asked of the speaker unless `cache` holds them for
 * these words, this voice and this model.
 */
export async function takeOf({
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
  const key = keyOf({ take: 1, model, voice, text })
  const wordsKey = keyOf({ words: 1, model, voice, text })
  const cached =
    (await cache.get(key, ".wav", wav)) &&
    (!timed || (await cache.get(wordsKey, ".json", kept)))
  if (!cached) {
    const take = await said(speaker, text, voice, timed)
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

/** A whole number from a flag, or `fallback` when the flag is unset. */
function wholeFlag(
  value: string | undefined,
  flag: string,
  fallback: number
): number {
  if (value === undefined) return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) fail([`--${flag} is a whole number`])
  return n
}

/**
 * The policy flags (`RenderPolicy`, #2635): the longest and largest video,
 * and what one video's step cache may hold.
 */
export const POLICY_OPTIONS = {
  "max-video-minutes": { type: "string" },
  "max-video-mb": { type: "string" },
  "cache-mb": { type: "string" },
} as const

/** The policy the flags set, each unset one at its default. */
export function policyOf(values: {
  readonly "max-video-minutes"?: string
  readonly "max-video-mb"?: string
  readonly "cache-mb"?: string
}): RenderPolicy {
  return {
    maxVideoMs:
      wholeFlag(
        values["max-video-minutes"],
        "max-video-minutes",
        DEFAULT_POLICY.maxVideoMs / 60_000
      ) * 60_000,
    maxVideoBytes:
      wholeFlag(
        values["max-video-mb"],
        "max-video-mb",
        DEFAULT_POLICY.maxVideoBytes / MB
      ) * MB,
    cacheBytes:
      wholeFlag(
        values["cache-mb"],
        "cache-mb",
        DEFAULT_POLICY.cacheBytes / MB
      ) * MB,
  }
}

/**
 * The music bed `seriesDir`'s version `version` names, copied into `root`
 * from `brand`, home's folder of the owner's files (never a repository's);
 * the renderer checks it against the series' sum. False when the series
 * names none.
 */
export async function placeBed(
  seriesDir: string,
  version: number,
  brand: string | undefined,
  root: string
): Promise<boolean> {
  const series = await readSeries(seriesDir, version)
  if (!series.ok) fail(["The series can't be read:", ...series.problems])
  const bed = series.value.music?.bed
  if (!bed) return false
  if (!brand)
    fail([
      `The series names the music ${bed.file}, and --brand names no folder holding it`,
    ])
  await mkdir(dirname(join(root, bed.file)), { recursive: true })
  await copyFile(join(here(brand), basename(bed.file)), join(root, bed.file))
  return true
}
