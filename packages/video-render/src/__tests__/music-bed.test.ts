/** The music bed we make ourselves (#2673). */
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { callFormat } from "@video-render/call"
import { MUSIC_BED, musicBedWav } from "@video-render/music-bed"
import { readSeries } from "@video-render/node"
import { sin2pi } from "@video-render/synth"
import { templateFormat } from "@video-render/templates"
import { describe, expect, it } from "vitest"

const wav = musicBedWav()
const samples = new Int16Array(wav.slice(44).buffer)

describe("the music bed", () => {
  it("is the bytes its pin names", () => {
    expect(createHash("sha256").update(wav).digest("hex")).toBe(
      MUSIC_BED.sha256
    )
  })

  it("plays under the call and Playoff Delta, pinned by its sum in each's series", async () => {
    for (const series of [
      callFormat().series,
      templateFormat("playoff-delta-week").series,
      templateFormat("playoff-delta-legend").series,
    ]) {
      const read = await readSeries(
        fileURLToPath(
          new URL(`../sample/series/${series.id}`, import.meta.url)
        ),
        series.version
      )
      expect(read.ok && read.value.music?.bed).toEqual({
        file: `brand/${MUSIC_BED.file}`,
        sha256: MUSIC_BED.sha256,
      })
    }
  })

  it("is 53⅓ s of mono 48 kHz samples: eight two-bar chords at 72 a minute", () => {
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
})
