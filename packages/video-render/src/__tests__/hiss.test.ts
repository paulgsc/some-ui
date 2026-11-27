/**
 * HISS1 (#3607): the ported stages of the owner's chain (C1611) against
 * what they port. The values below are noisereduce 3.0.3's
 * (`reduce_noise(stationary=True, prop_decrease=0.9, n_fft=2048)`, the
 * profile the input's quietest 15% of 10 ms frames) and numpy's, for the
 * C2 expander and trim, on the same input, computed once in Python and
 * kept here so the port is held to them without Python.
 */
import {
  expand,
  HISS_POLICY,
  percentileOf,
  spectralGate,
} from "@video-render/hiss"
import { sin2pi } from "@video-render/synth"
import { describe, expect, it } from "vitest"

const RATE = 48_000

/** 0.6 s: hiss at 0.01, and two tones from 0.2 s to 0.4 s. */
function input(): Float64Array {
  const x = new Float64Array(28_800)
  let seed = 11
  for (let i = 0; i < x.length; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    const t = i / RATE
    const on = i >= 9_600 && i < 19_200
    x[i] =
      ((seed / 2147483648) * 2 - 1) * 0.01 +
      (on ? 0.3 * sin2pi((220 * t) % 1) + 0.15 * sin2pi((660 * t) % 1) : 0)
  }
  return x
}

describe("spectralGate (HISS1)", () => {
  it("gives what noisereduce's stationary gate gives", () => {
    const y = spectralGate(input(), RATE)
    const want: ReadonlyArray<readonly [number, number]> = [
      [0, 0.0006259488916],
      [1_000, 0.0004413108712],
      [4_800, 0.001195229707],
      [9_000, 0.0007400796264],
      [9_700, 0.1358217686],
      [12_345, -0.2189838919],
      [15_000, -0.1402505629],
      [19_100, -0.1254756157],
      [19_300, 0.00694146575],
      [24_000, -0.001587905494],
      [28_799, 0.001462423966],
    ]
    expect(y.length).toBe(28_800)
    for (const [i, v] of want)
      expect(Math.abs((y[i] ?? 0) - v)).toBeLessThan(1e-6)
  })

  it("is the same each time", () => {
    expect(spectralGate(input(), RATE)).toEqual(spectralGate(input(), RATE))
  })

  it("filters a take longer than a chunk in chunks, as noisereduce does", () => {
    const policy = { ...HISS_POLICY, chunk: 10_000, padding: 4_000 }
    const y = spectralGate(input(), RATE, policy)
    expect(y.length).toBe(28_800)
    // Each chunk sees its neighbours through its padding: the tone is kept.
    expect(Math.abs(y[12_345] ?? 0)).toBeGreaterThan(0.15)
  })
})

describe("expand (HISS1)", () => {
  it("gives what the owner's C2 expander and trim give", () => {
    const e = expand(spectralGate(input(), RATE), RATE)
    if (e === null) throw new Error("nothing voiced")
    expect(e.fromSample).toBe(6_720)
    expect(e.samples.length).toBe(18_720)
    const want: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [1_000, -0.0001792311217],
      [4_800, -0.1698514384],
      [9_000, 0.1561550449],
      [9_700, 0.1417447445],
      [12_345, 0.244462734],
    ]
    for (const [i, v] of want)
      expect(Math.abs((e.samples[i] ?? 0) - v)).toBeLessThan(1e-6)
  })

  it("keeps nothing of a take with no voice in it", () => {
    expect(expand(new Float64Array(4_800), RATE)).toBeNull()
  })

  it("never turns a pause down past its floor", () => {
    const e = expand(input(), RATE)
    if (e === null) throw new Error("nothing voiced")
    const x = input()
    // Away from the fades, every sample keeps at least the floor's share.
    for (let i = 2_000; i < e.samples.length - 2_000; i += 97) {
      const raw = Math.abs(x[e.fromSample + i] ?? 0)
      expect(Math.abs(e.samples[i] ?? 0)).toBeGreaterThanOrEqual(
        raw * HISS_POLICY.floor - 1e-12
      )
    }
  })
})

describe("percentileOf", () => {
  it("is numpy's, linear between ranks", () => {
    expect(percentileOf([1, 2, 3, 4], 0.15)).toBeCloseTo(1.45, 12)
    expect(percentileOf([5], 0.9)).toBe(5)
  })
})
