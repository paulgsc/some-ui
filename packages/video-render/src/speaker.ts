/**
 * Asking home's Kokoro speaker for a scene's take in parts small enough that
 * each is answered in bounded time (SPK1).
 *
 * Kokoro on home runs on CPU and says one line at a time, so a scene's whole
 * text in one request could take longer than Node's fetch waits for an
 * answer's first byte (undici's 300 s headers timeout), and the recorder
 * died with no word of which scene (week 2026-w46's essay, scene 9 of 28).
 * So a scene is said in parts of at most `SPEAKER_CHUNK_CHARS`, split after
 * a sentence (else between words), each asked with its own deadline under
 * that timeout, and the parts' WAVs are joined, each word's place offset by
 * the audio before its part. A scene of one part is asked exactly as before,
 * so its bytes, and its kept take, are unchanged.
 *
 * Promise SPK1: every scene the speaker can say ends in its whole take, or in
 * a caught failure naming the scene and why, within `SPEAKER_DEADLINE_MS` a
 * part. Family: the scene's length (one part, several, a sentence or a word
 * past the part's size), the speaker's speed (prompt, slow inside the
 * deadline, hanging), and the speaker down (refused, an error answer).
 * Proof: `__tests__/speaker.test.ts`, with a slow, a hanging and a failing
 * stub speaker on a fake clock.
 */

import type { TimedWord } from "./cut-list"
import { pcmOf } from "./wav"

/** The most characters asked of the speaker at once. */
export const SPEAKER_CHUNK_CHARS = 400

/**
 * How long one part may take to be answered: generous for a part's size, and
 * under undici's 300 s headers timeout, so this deadline, which names the
 * scene, is always the one that ends a wait.
 */
export const SPEAKER_DEADLINE_MS = 4 * 60_000

/**
 * Where a sentence ends: the space after `.`, `!`, `?` or `…` and any closing
 * quote or bracket, before a capital or a digit. A mark with no space after
 * it ("3.5", "example.com"), or one a lower-case word follows ("e.g. at"),
 * ends nothing.
 */
const SENTENCE_END = /(?<=[.!?…]["'”’)\]]*)(\s+)(?=["'“‘([]*[\p{Lu}\p{N}])/u

/** A run of `text` to pack, and the whitespace before it, as written. */
type Unit = { readonly before: string; readonly text: string }

/** `text` split at `at` (a pattern with one capturing group for the gap), gaps kept. */
function unitsOf(text: string, at: RegExp): Array<Unit> {
  const bits = text.split(at)
  const units: Array<Unit> = []
  for (let i = 0; i < bits.length; i += 2)
    units.push({
      before: i === 0 ? "" : (bits[i - 1] ?? ""),
      text: bits[i] ?? "",
    })
  return units.filter((u) => u.text !== "")
}

/**
 * `text` in the parts the speaker is asked for, in order: whole sentences
 * packed up to `most` characters, a sentence longer than that cut between
 * words, and a word longer than that alone. Each part is `text`'s own
 * characters, as written, between two of its gaps; a scene that fits is
 * one part, exactly `text`.
 */
export function speakerChunks(
  text: string,
  most: number = SPEAKER_CHUNK_CHARS
): ReadonlyArray<string> {
  if (text.length <= most) return [text]
  const units = unitsOf(text.trim(), SENTENCE_END).flatMap((sentence) =>
    sentence.text.length <= most
      ? [sentence]
      : unitsOf(sentence.text, /(\s+)/u).map((word, i) =>
          i === 0 ? { ...word, before: sentence.before } : word
        )
  )
  const parts: Array<string> = []
  let part = ""
  for (const unit of units) {
    const joined = part === "" ? unit.text : `${part}${unit.before}${unit.text}`
    if (joined.length <= most || part === "") part = joined
    else {
      parts.push(part)
      part = unit.text
    }
  }
  if (part !== "") parts.push(part)
  return parts
}

/** A part as the speaker said it: a WAV, and its words when asked `timed`. */
export type SpeakerTake = {
  readonly wav: Uint8Array
  readonly words: ReadonlyArray<TimedWord> | null
}

/** Asks the speaker for `text`, giving up when `signal` aborts. */
export type AskSpeaker = (
  text: string,
  signal: AbortSignal
) => Promise<SpeakerTake>

export type SceneSpoken =
  | { readonly ok: true; readonly take: SpeakerTake }
  | { readonly ok: false; readonly problem: string }

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.byteLength === b.byteLength && a.every((x, i) => x === b[i])

/**
 * The parts' takes as one: their samples in order under the first's format,
 * each word placed after the audio of the parts before it. Null when a part
 * is no PCM WAV or its format differs from the first's.
 */
export function joinTakes(
  takes: ReadonlyArray<SpeakerTake>
): SpeakerTake | null {
  const pcms = takes.map((t) => pcmOf(t.wav))
  const first = pcms[0]
  if (first === undefined || first === null || first.byteRate <= 0) return null
  const data: Array<Uint8Array> = []
  const words: Array<TimedWord> = []
  let ms = 0
  for (const [i, pcm] of pcms.entries()) {
    if (pcm === null || !sameBytes(pcm.format, first.format)) return null
    data.push(pcm.data)
    const offset = Math.round(ms)
    for (const w of takes[i]?.words ?? [])
      words.push({
        text: w.text,
        startMs: w.startMs + offset,
        endMs: w.endMs + offset,
      })
    ms += (pcm.data.byteLength / first.byteRate) * 1000
  }
  const size = data.reduce((n, d) => n + d.byteLength, 0)
  const head = 12 + 8 + first.format.byteLength + 8
  const wav = new Uint8Array(head + size)
  const view = new DataView(wav.buffer)
  const ascii = (at: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i))
  }
  ascii(0, "RIFF")
  view.setUint32(4, head - 8 + size, true)
  ascii(8, "WAVE")
  ascii(12, "fmt ")
  view.setUint32(16, first.format.byteLength, true)
  wav.set(first.format, 20)
  ascii(20 + first.format.byteLength, "data")
  view.setUint32(24 + first.format.byteLength, size, true)
  let at = head
  for (const d of data) {
    wav.set(d, at)
    at += d.byteLength
  }
  const timed = takes.every((t) => t.words !== null)
  return { wav, words: timed ? words : null }
}

/** An error's message, with its cause's ("fetch failed: connect ECONNREFUSED …"). */
function whyOf(e: unknown): string {
  if (!(e instanceof Error)) return String(e)
  return e.cause instanceof Error
    ? `${e.message}: ${e.cause.message}`
    : e.message
}

const minutes = (ms: number): string => {
  const m = Math.round(ms / 6000) / 10
  return `${String(m)} min`
}

/**
 * Scene `scene`'s `text`, said by `ask` part by part (`speakerChunks`), each
 * part given up after `deadlineMs`: its whole take, or why not, naming the
 * scene. A failure here is the speaker's, never the render policy's.
 */
export async function speakScene({
  scene,
  text,
  ask,
  deadlineMs = SPEAKER_DEADLINE_MS,
  most = SPEAKER_CHUNK_CHARS,
}: {
  readonly scene: string
  readonly text: string
  readonly ask: AskSpeaker
  readonly deadlineMs?: number
  readonly most?: number
}): Promise<SceneSpoken> {
  const parts = speakerChunks(text, most)
  const takes: Array<SpeakerTake> = []
  for (const [i, part] of parts.entries()) {
    const which =
      parts.length === 1
        ? `scene ${scene}`
        : `scene ${scene} (part ${String(i + 1)} of ${String(parts.length)})`
    const stop = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const late = new Promise<"late">((done) => {
      timer = setTimeout(() => {
        done("late")
      }, deadlineMs)
    })
    const asked = ask(part, stop.signal)
    // Ignored: a part given up on still settles, aborted, after the deadline
    // has already said why; and a part that fails in time is caught below.
    asked.catch(() => undefined)
    try {
      const answer = await Promise.race([asked, late])
      if (answer === "late") {
        stop.abort()
        return {
          ok: false,
          problem: `the speaker didn't answer for ${which} in ${minutes(deadlineMs)}`,
        }
      }
      takes.push(answer)
    } catch (e) {
      const why = whyOf(e)
      return {
        ok: false,
        problem: `the speaker failed for ${which}: ${why}`,
      }
    } finally {
      clearTimeout(timer)
    }
  }
  if (takes.length === 1 && takes[0] !== undefined)
    return { ok: true, take: takes[0] }
  const joined = joinTakes(takes)
  return joined === null
    ? {
        ok: false,
        problem: `the speaker's parts for scene ${scene} don't join into one take`,
      }
    : { ok: true, take: joined }
}
