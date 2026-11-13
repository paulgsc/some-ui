/** The sound kit we make ourselves (HYPER4, #2727). */
import { createHash } from "node:crypto"
import { CUES, cueWav } from "@video-render/cues"
import { addTone, pcm16 } from "@video-render/synth"
import { SOUNDS } from "@video-render/vocabulary"
import { describe, expect, it } from "vitest"

const samplesOf = (wav: Uint8Array): Int16Array => {
  // Little-endian, as WAV is, whatever this machine's order.
  const view = new DataView(wav.buffer, wav.byteOffset + 44)
  return Int16Array.from({ length: view.byteLength / 2 }, (_, i) =>
    view.getInt16(i * 2, true)
  )
}

describe("the sound kit", () => {
  it.each(SOUNDS)("%s is the bytes its pin names", (sound) => {
    expect(createHash("sha256").update(cueWav(sound)).digest("hex")).toBe(
      CUES[sound].sha256
    )
  })

  it.each(SOUNDS)(
    "%s peaks at -6 dBFS, lasts under 2 s and ends in silence",
    (sound) => {
      const samples = samplesOf(cueWav(sound))
      const peak = Math.max(...Array.from(samples, Math.abs))
      expect(peak).toBeGreaterThanOrEqual(Math.round(0.5 * 32767) - 1)
      expect(peak).toBeLessThanOrEqual(Math.round(0.5 * 32767))
      expect(samples.length).toBeLessThan(2 * 48_000)
      expect(samples.at(-1)).toBe(0)
    }
  )

  it("names every sound a series can, each in its own file", () => {
    expect(Object.keys(CUES).sort()).toEqual([...SOUNDS].sort())
    expect(new Set(SOUNDS.map((s) => CUES[s].file)).size).toBe(SOUNDS.length)
  })
})

describe("the synthesiser's refusals", () => {
  it("refuses a peak outside (0, 1] and a sample that isn't a number", () => {
    const x = Float64Array.of(0.1, -0.2)
    expect(() => pcm16(x, 0)).toThrow(RangeError)
    expect(() => pcm16(x, 1.5)).toThrow(RangeError)
    expect(() => pcm16(x, Number.NaN)).toThrow(RangeError)
    expect(() => pcm16(Float64Array.of(0, Number.NaN), 0.5)).toThrow(RangeError)
    expect(() => pcm16(Float64Array.of(0, Infinity), 0.5)).toThrow(RangeError)
    expect(Array.from(pcm16(x, 1))).toEqual([16384, -32767])
  })

  it("refuses a tone that starts off a whole sample or outside the buffer", () => {
    const out = new Float64Array(10)
    const tone = (start: number): void =>
      addTone(out, start, 4, 440, [[1, 1]], () => 1)
    expect(() => tone(2.5)).toThrow(RangeError)
    expect(() => tone(-1)).toThrow(RangeError)
    expect(() => tone(10)).toThrow(RangeError)
    expect(() => tone(9)).not.toThrow()
  })
})
