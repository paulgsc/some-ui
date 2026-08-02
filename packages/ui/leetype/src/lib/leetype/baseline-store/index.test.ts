import { beforeEach, describe, expect, it } from "vitest"

import {
  blendBaseline,
  clearBaseline,
  COLD_START_BASELINE,
  effectiveBaseline,
  loadBaseline,
  sampleFromIntervals,
  saveBaseline,
} from "."

/** `count` intervals at a steady WPM, in milliseconds. */
function steady(wpm: number, count: number): Array<number> {
  return Array.from({ length: count }, () => 60_000 / (wpm * 5))
}

beforeEach(() => {
  localStorage.clear()
})

describe("persistence", () => {
  it("round-trips a baseline", () => {
    const baseline = {
      wpm: 72.5,
      dispersion: 9,
      samples: 3,
      updatedAt: 1_700_000_000_000,
    }
    saveBaseline(baseline)
    expect(loadBaseline()).toEqual(baseline)
  })

  it("reads a missing sample as 'not calibrated' rather than failing", () => {
    expect(loadBaseline()).toBeNull()
    expect(effectiveBaseline(loadBaseline())).toEqual(COLD_START_BASELINE)
  })

  it("degrades silently on corrupt storage and never blocks play", () => {
    for (const junk of ["", "{", "null", '{"version":2}', '"a string"']) {
      localStorage.setItem("leetyping_progress", junk)
      expect(loadBaseline()).toBeNull()
      expect(effectiveBaseline(loadBaseline()).wpm).toBeGreaterThan(0)
    }
  })

  it("discards the XP economy's payload this key used to hold", () => {
    // The v1 shape. Reusing one ephemeral store beats standing up a second,
    // and the cost of the collision is exactly one warm-up.
    localStorage.setItem(
      "leetyping_progress",
      JSON.stringify({ xp: 400, level: 4, solves: [{ challengeId: "a" }] })
    )
    expect(loadBaseline()).toBeNull()
  })

  it("clears back to a cold start", () => {
    saveBaseline({ wpm: 80, dispersion: 5, samples: 9, updatedAt: 1 })
    clearBaseline()
    expect(loadBaseline()).toBeNull()
  })
})

describe("sampling", () => {
  it("reads back roughly the rate the intervals were generated at", () => {
    const sample = sampleFromIntervals(steady(60, 40))
    expect(sample?.wpm).toBeCloseTo(60, 1)
  })

  it("refuses a run too short to say anything", () => {
    expect(sampleFromIntervals(steady(60, 4))).toBeNull()
    expect(sampleFromIntervals([])).toBeNull()
  })

  it("ignores one long hesitation — the trimmed mean is the whole choice", () => {
    // The event this baseline must NOT absorb: a hesitation is what the
    // reveal loop detects, so calibrating against it would be calibrating
    // the detector on the thing it detects.
    const withPause = [...steady(60, 40)]
    withPause[20] = 8_000

    const clean = sampleFromIntervals(steady(60, 40))
    const paused = sampleFromIntervals(withPause)

    expect(paused?.wpm).toBeCloseTo(clean?.wpm ?? 0, 1)
  })

  it("gives a steady typist a narrower dispersion than an erratic one", () => {
    const metronome = sampleFromIntervals(steady(60, 40))
    const erratic = sampleFromIntervals(
      steady(60, 40).map(
        (interval, index) => interval * (index % 2 === 0 ? 0.4 : 2.2)
      )
    )

    expect(metronome?.dispersion).toBeLessThan(erratic?.dispersion ?? 0)
  })

  it("records the centre and the scale as separate facts", () => {
    const sample = sampleFromIntervals(steady(45, 30))
    expect(sample?.wpm).toBeCloseTo(45, 1)
    expect(sample?.dispersion).toBeGreaterThanOrEqual(0)
    expect(sample?.samples).toBe(1)
  })
})

describe("staleness", () => {
  it("takes the first real sample outright rather than averaging it with a guess", () => {
    const sample = sampleFromIntervals(steady(90, 40))
    if (!sample) throw new Error("a 40-interval run is a sample")

    const blended = blendBaseline(null, sample)
    expect(blended.wpm).toBeCloseTo(90, 1)
    expect(blended.samples).toBe(1)

    // The cold start is a stand-in, not evidence: it must not drag a real
    // measurement toward itself either.
    expect(blendBaseline(COLD_START_BASELINE, sample).wpm).toBeCloseTo(90, 1)
  })

  it("follows a player who gets faster, over several runs", () => {
    const faster = sampleFromIntervals(steady(100, 40))
    if (!faster) throw new Error("a 40-interval run is a sample")

    let baseline = { wpm: 50, dispersion: 8, samples: 4, updatedAt: 0 }
    const trail = [baseline.wpm]
    for (let run = 0; run < 10; run++) {
      baseline = blendBaseline(baseline, faster)
      trail.push(baseline.wpm)
    }

    // Monotone, two-thirds of the way after five runs, nine-tenths after ten.
    expect(
      trail.every((wpm, index) => index === 0 || wpm > (trail[index - 1] ?? 0))
    ).toBe(true)
    expect(trail[5]).toBeGreaterThan(50 + 50 * 0.65)
    expect(trail[10]).toBeGreaterThan(50 + 50 * 0.88)
    expect(baseline.wpm).toBeLessThan(100)
    expect(baseline.samples).toBe(14)
  })

  it("does not let one bad morning recalibrate the game", () => {
    const slow = sampleFromIntervals(steady(20, 40))
    if (!slow) throw new Error("a 40-interval run is a sample")

    const established = { wpm: 90, dispersion: 6, samples: 20, updatedAt: 0 }
    const after = blendBaseline(established, slow)
    expect(after.wpm).toBeGreaterThan(70)
  })
})
