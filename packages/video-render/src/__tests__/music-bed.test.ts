/**
 * The music bed we make ourselves (#2673): the bytes its pin names, a loop
 * with no seam, quiet, and made only from operations IEEE 754 rounds the
 * same on every machine.
 */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { MUSIC_BED, musicBedWav, sin2pi } from "@video-render/music-bed"
import { describe, expect, it } from "vitest"

const wav = musicBedWav()
const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
const samples = new Int16Array(wav.slice(44).buffer)

describe("the music bed", () => {
  it("is the bytes its pin names", () => {
    expect(createHash("sha256").update(wav).digest("hex")).toBe(
      MUSIC_BED.sha256
    )
  })

  it("is a mono 48 kHz 16-bit WAV of eight two-bar chords at 72 a minute", () => {
    const ascii = (at: number): string =>
      String.fromCharCode(...wav.slice(at, at + 4))
    expect([ascii(0), ascii(8), ascii(12), ascii(36)]).toEqual([
      "RIFF",
      "WAVE",
      "fmt ",
      "data",
    ])
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(48_000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(samples.length).toBe(48_000 * (160 / 3))
  })

  it("peaks at -6 dBFS and never sits silent", () => {
    let peak = 0
    let quietest = Infinity
    const window = 4_800
    for (let at = 0; at < samples.length; at += window) {
      let sum = 0
      for (let i = at; i < at + window; i++) {
        const s = samples[i] ?? 0
        peak = Math.max(peak, Math.abs(s))
        sum += s * s
      }
      quietest = Math.min(quietest, Math.sqrt(sum / window))
    }
    expect(peak).toBe(Math.round(0.5 * 32767))
    // Every tenth of a second carries the pad, so it covers each silence.
    expect(quietest).toBeGreaterThan(32767 * 0.01)
  })

  it("loops with no seam: the last sample leads into the first as any two do", () => {
    let largest = 0
    for (let i = 1; i < samples.length; i++)
      largest = Math.max(
        largest,
        Math.abs((samples[i] ?? 0) - (samples[i - 1] ?? 0))
      )
    const seam = Math.abs((samples[0] ?? 0) - (samples.at(-1) ?? 0))
    expect(seam).toBeLessThanOrEqual(largest)
  })

  it("draws its sine within 1e-7 of the engine's", () => {
    for (let k = 0; k < 1000; k++) {
      const p = k / 1000
      expect(Math.abs(sin2pi(p) - Math.sin(2 * Math.PI * p))).toBeLessThan(1e-7)
    }
  })

  it("calls no function whose last bit an engine may choose", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../music-bed.ts", import.meta.url)),
      "utf8"
    )
    expect(source).not.toMatch(
      /Math\.(sin|cos|tan|exp|expm1|log|pow|cbrt|hypot|atan2?|asin|acos|sinh|cosh|tanh)\b|[\w)]\s*\*\*\s*[\w(]/
    )
  })
})
