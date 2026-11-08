/** The music bed we make ourselves (#2673). */
import { createHash } from "node:crypto"
import { MUSIC_BED, musicBedWav } from "@video-render/music-bed"
import { sin2pi } from "@video-render/synth"
import { describe, expect, it } from "vitest"

const wav = musicBedWav()
// Little-endian, as WAV is, whatever this machine's order.
const view = new DataView(wav.buffer, wav.byteOffset + 44)
const samples = Int16Array.from({ length: view.byteLength / 2 }, (_, i) =>
  view.getInt16(i * 2, true)
)

describe("the music bed", () => {
  it("is the bytes its pin names", () => {
    expect(createHash("sha256").update(wav).digest("hex")).toBe(
      MUSIC_BED.sha256
    )
  })

  it("is 53⅓ s of mono 48 kHz samples: eight two-bar chords at 72 a minute", () => {
    expect(samples.length).toBe(48_000 * (160 / 3))
  })

  it("peaks at -6 dBFS and never sits silent", () => {
    let peak = 0
    let quietest = Infinity
    const window = 4_000
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

  it("loops with no seam: the last sample leads into the first as its neighbours do", () => {
    const step = (i: number): number =>
      Math.abs((samples.at(i) ?? 0) - (samples.at(i - 1) ?? 0))
    const seam = step(0)
    const near = Math.max(
      ...[-8, -7, -6, -5, -4, -3, -2, 1, 2, 3, 4, 5, 6, 7, 8].map(step)
    )
    expect(seam).toBeLessThanOrEqual(1.5 * near)
  })

  it("draws its sine within 1e-7 of the engine's", () => {
    for (let k = 0; k < 1000; k++) {
      const p = k / 1000
      expect(Math.abs(sin2pi(p) - Math.sin(2 * Math.PI * p))).toBeLessThan(1e-7)
    }
  })
})
