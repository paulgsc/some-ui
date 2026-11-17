/**
 * SPK1: every scene ends in its whole take or a caught failure naming it,
 * within the deadline a part. Family: the scene's length (one part, several,
 * a sentence or a word past a part's size) × the speaker's speed (prompt,
 * slow inside the deadline, hanging) × the speaker down (refused, an error).
 */
import type { AskSpeaker, SpeakerTake } from "@video-render/speaker"
import {
  joinTakes,
  SPEAKER_CHUNK_CHARS,
  SPEAKER_DEADLINE_MS,
  speakerChunks,
  speakScene,
} from "@video-render/speaker"
import { afterEach, describe, expect, it, vi } from "vitest"

/** A mono 24 kHz 16-bit WAV of `samples`, as Python's `wave` writes one. */
function wav(samples: ReadonlyArray<number>, rate = 24_000): Uint8Array {
  const data = samples.length * 2
  const bytes = new Uint8Array(44 + data)
  const view = new DataView(bytes.buffer)
  const ascii = (at: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i))
  }
  ascii(0, "RIFF")
  view.setUint32(4, 36 + data, true)
  ascii(8, "WAVE")
  ascii(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, "data")
  view.setUint32(40, data, true)
  for (const [i, s] of samples.entries()) view.setInt16(44 + i * 2, s, true)
  return bytes
}

/** A stub speaker: each word 10 ms of audio and its place, answered after `ms`. */
function speaker(
  ms: (part: string, nth: number) => number | "hang" | Error
): AskSpeaker & { readonly asked: Array<string> } {
  const asked: Array<string> = []
  const ask = (part: string, signal: AbortSignal): Promise<SpeakerTake> => {
    asked.push(part)
    const after = ms(part, asked.length)
    if (after instanceof Error) return Promise.reject(after)
    return new Promise((done, failed) => {
      signal.addEventListener("abort", () => {
        failed(new Error("aborted"))
      })
      if (after === "hang") return
      setTimeout(() => {
        let at = 0
        done({
          // Each word 10 ms of audio (240 samples at 24 kHz).
          wav: wav(
            Array.from(
              { length: part.split(/\s+/u).length * 240 },
              (_, i) => i % 97
            )
          ),
          words: part.split(/\s+/u).map((text) => {
            const word = { text, startMs: at, endMs: at + 10 }
            at += 10
            return word
          }),
        })
      }, after)
    })
  }
  return Object.assign(ask, { asked })
}

const sentence = (n: number): string =>
  `Sentence ${String(n)} says a little about ownership and borrowing in Rust.`
const SHORT = sentence(1)
const LONG = Array.from({ length: 30 }, (_, i) => sentence(i)).join(" ")
const RUN_ON = Array.from({ length: 200 }, () => "word").join(" ")
const ONE_WORD = "x".repeat(SPEAKER_CHUNK_CHARS + 50)
/** Marks inside sentences that end nothing, a line break, quotes and accents. */
const PROSE = Array.from(
  { length: 8 },
  (_, i) =>
    `Item ${String(i)} costs 3.5 dollars, e.g. at example.com... "Really?" she asked.\nCafé, naïve — fine!`
).join(" ")
const SCENES = {
  short: SHORT,
  long: LONG,
  prose: PROSE,
  runOn: RUN_ON,
  oneWord: ONE_WORD,
}

afterEach(() => {
  vi.useRealTimers()
})

describe("speakerChunks", () => {
  it.each(Object.entries(SCENES))(
    "keeps every word of a %s scene once, in order, in parts no longer than a part's size",
    (_, text) => {
      const parts = speakerChunks(text)
      expect(parts.join(" ").split(/\s+/u)).toEqual(text.trim().split(/\s+/u))
      // Each part is the scene's own characters as written, in order.
      let from = 0
      for (const part of parts) {
        const at = text.indexOf(part, from)
        expect(at, part).toBeGreaterThanOrEqual(from)
        from = at + part.length
      }
      for (const part of parts)
        expect(
          part.length <= SPEAKER_CHUNK_CHARS || !part.includes(" "),
          part
        ).toBe(true)
    }
  )

  it("asks a scene that fits in one part exactly as written", () => {
    expect(speakerChunks(SHORT)).toEqual([SHORT])
    expect(speakerChunks(`\n${SHORT} `)).toEqual([`\n${SHORT} `])
  })

  it("splits only where a sentence ends, never inside 3.5, after e.g. or in a web address", () => {
    const parts = speakerChunks(PROSE)
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts.slice(0, -1))
      expect(part).toMatch(/[.!?…]["'”’)\]]*$/u)
    for (const part of parts) expect(part).not.toMatch(/e\.g\.$/u)
    expect(parts.join(" ")).toContain("3.5 dollars, e.g. at example.com...")
    expect(parts.join(" ")).toContain("asked.\nCafé")
  })

  it("splits after a sentence, not inside one, when sentences fit", () => {
    for (const part of speakerChunks(LONG)) expect(part).toMatch(/\.$/u)
  })
})

describe("SPK1: speakScene", () => {
  const SPEEDS: Record<string, () => number | "hang" | Error> = {
    prompt: () => 1_000,
    slow: () => SPEAKER_DEADLINE_MS - 1_000,
    hanging: () => "hang",
    down: () =>
      new TypeError("fetch failed", { cause: new Error("ECONNREFUSED") }),
  }

  for (const [length, text] of Object.entries(SCENES))
    for (const [speed, ms] of Object.entries(SPEEDS))
      it(`a ${length} scene with a ${speed} speaker ends, whole or named`, async () => {
        vi.useFakeTimers()
        const ask = speaker(ms)
        const spoken = speakScene({ scene: "09-dive", text, ask })
        await vi.runAllTimersAsync()
        const result = await spoken
        if (speed === "prompt" || speed === "slow") {
          expect(result.ok).toBe(true)
          if (!result.ok) return
          expect(result.take.words?.map((w) => w.text).join(" ")).toBe(
            text.trim().split(/\s+/u).join(" ")
          )
          const starts = (result.take.words ?? []).map((w) => w.startMs)
          expect(starts).toEqual([...starts].sort((a, b) => a - b))
          return
        }
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.problem).toMatch(/scene 09-dive/u)
        expect(result.problem).not.toMatch(/past the policy/u)
        if (speed === "hanging") {
          expect(result.problem).toMatch(/didn't answer .* in 4 min$/u)
          expect(ask.asked).toHaveLength(1)
        } else expect(result.problem).toMatch(/fetch failed: ECONNREFUSED/u)
      })

  it("gives one part's take back byte for byte", async () => {
    const ask = speaker(() => 0)
    const spoken = await speakScene({ scene: "01", text: SHORT, ask })
    const direct = await speaker(() => 0)(SHORT, new AbortController().signal)
    expect(spoken.ok && spoken.take.wav).toEqual(direct.wav)
  })

  it("joins parts' samples in order and places each word after the audio before it", () => {
    const a = {
      wav: wav([1, 2, 3]),
      words: [{ text: "a", startMs: 0, endMs: 1 }],
    }
    const b = { wav: wav([4, 5]), words: [{ text: "b", startMs: 0, endMs: 1 }] }
    const joined = joinTakes([a, b])
    expect(joined?.wav).toEqual(wav([1, 2, 3, 4, 5]))
    expect(joined?.words).toEqual([
      { text: "a", startMs: 0, endMs: 1 },
      { text: "b", startMs: 0, endMs: 1 },
    ])
    const second = joinTakes([
      { wav: wav(Array.from({ length: 24_000 }, () => 0)), words: [] },
      b,
    ])
    expect(second?.words).toEqual([{ text: "b", startMs: 1000, endMs: 1001 }])
  })

  it("refuses to join parts of different formats, or that are no WAV", () => {
    const a = { wav: wav([1]), words: null }
    expect(joinTakes([a, { wav: wav([1], 48_000), words: null }])).toBeNull()
    expect(joinTakes([a, { wav: new Uint8Array(8), words: null }])).toBeNull()
  })

  it.each([
    ["hangs", (): "hang" => "hang"],
    [
      "fails",
      (): Error => new Error("it answered 500: the line could not be said"),
    ],
  ])(
    "a later part that %s fails the scene by that part, after the earlier parts were said",
    async (_, later) => {
      vi.useFakeTimers()
      const ask = speaker((_part, nth) => (nth === 1 ? 1_000 : later()))
      const spoken = speakScene({ scene: "09-dive", text: LONG, ask })
      await vi.runAllTimersAsync()
      const result = await spoken
      expect(ask.asked).toHaveLength(2)
      expect(result.ok).toBe(false)
      if (!result.ok)
        expect(result.problem).toMatch(/scene 09-dive \(part 2 of \d+\)/u)
    }
  )
})
