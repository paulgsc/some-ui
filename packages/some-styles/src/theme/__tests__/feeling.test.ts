/**
 * Feeling themes against the session themes' real CSS.
 *
 * MK5 (docs/makjang/README.md, "Invariants"): every feeling clears the
 * contrast floor on every session theme. The roles are resolved from
 * `tokens/base.css` and `themes/*.css`, never copied, so retuning a session
 * theme re-runs the floor against what it now ships.
 */

import { readFileSync } from "node:fs"
import { format, resolveConfig } from "prettier"
import { describe, expect, it } from "vitest"

import {
  FEELING_CSS_PATH,
  feelingCss,
  themeSources,
} from "../../../scripts/write-feeling-css"
import type { Oklch } from "../feeling"
import {
  CONTRAST_FLOOR,
  contrastRatio,
  FEELING_KEYS,
  FEELING_POINTS,
  feelingColors,
  feelingFrame,
  feelingTone,
} from "../feeling"
import { SESSION_THEMES } from "../registry"
import { parseOklch, sessionRoles } from "../session-roles"

const sources = themeSources()
const sessions = SESSION_THEMES.map((theme) => ({
  theme,
  roles: sessionRoles(theme, sources),
}))

const close = (a: Oklch, b: Oklch): boolean =>
  Math.abs(a[0] - b[0]) < 0.001 &&
  Math.abs(a[1] - b[1]) < 0.001 &&
  (a[1] < 0.001 || Math.abs(a[2] - b[2]) < 0.5)

describe("the session roles", () => {
  it.each(
    sessions.map(({ theme, roles }) => [theme.id, theme, roles] as const)
  )("%s resolves to the colours its swatch shows", (_, theme, roles) => {
    // The swatch is the registry's own sample of the same theme: if the
    // resolver read the cascade wrong, the two disagree.
    expect(close(roles.background, parseOklch(theme.swatch.bg))).toBe(true)
    expect(close(roles.foreground, parseOklch(theme.swatch.fg))).toBe(true)
  })
})

describe("MK5: the contrast floor", () => {
  const cases = sessions.flatMap(({ theme, roles }) =>
    FEELING_KEYS.map((key) => [theme.id, key, roles] as const)
  )

  it.each(cases)("%s × %s", (_, key, roles) => {
    const { ground, textured, ink, muted, accent } = feelingColors(key, roles)
    // Text sits on the plain ground and on the texture's strokes.
    for (const under of [ground, textured]) {
      expect(contrastRatio(ink, under)).toBeGreaterThanOrEqual(
        CONTRAST_FLOOR.text
      )
      expect(contrastRatio(muted, under)).toBeGreaterThanOrEqual(
        CONTRAST_FLOOR.text
      )
    }
    expect(contrastRatio(accent, ground)).toBeGreaterThanOrEqual(
      CONTRAST_FLOOR.mark
    )
  })
})

describe("themes/feeling.css", () => {
  const shipped = readFileSync(FEELING_CSS_PATH, "utf8")

  it("is what the derivation writes (pnpm generate:feelings)", async () => {
    const config = await resolveConfig(FEELING_CSS_PATH)
    const expected = await format(feelingCss(), {
      ...config,
      filepath: FEELING_CSS_PATH,
    })
    expect(shipped).toBe(expected)
  })

  it("declares no custom property but its own, so it overrides no role", () => {
    const declared = Array.from(
      shipped.matchAll(/(--[a-z0-9-]+)\s*:/g),
      (match): string => match[1] ?? ""
    )
    expect(declared.length).toBeGreaterThan(0)
    for (const name of declared) expect(name).toMatch(/^--feeling-/)
  })

  it("plays no motion under prefers-reduced-motion", () => {
    expect(shipped).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.feeling-motion\s*\{\s*animation: none;/
    )
  })
})

describe("the derivation", () => {
  it("gives each feeling its own motion: eight keyframe kinds", () => {
    const motions = FEELING_KEYS.map((key) => FEELING_POINTS[key].motion)
    expect(new Set(motions).size).toBe(FEELING_KEYS.length)
  })

  it("times and scales motion by arousal", () => {
    // fury: a = 0.95; warmth: a < 0, so it moves at the calm end.
    expect(feelingFrame("fury")).toMatchObject({
      motionMs: Math.round(950 - 450 * 0.95),
      amplitude: 0.35 + 0.65 * 0.95,
    })
    expect(feelingFrame("warmth")).toMatchObject({
      motionMs: 950,
      amplitude: 0.35,
    })
  })

  it("draws the edge from the point: jagged fury, rounded flutter", () => {
    expect(feelingFrame("fury")).toMatchObject({ jagged: true, edgeWidth: 0 })
    expect(feelingFrame("flutter")).toMatchObject({
      jagged: false,
      radius: 14,
    })
    expect(feelingFrame("tension").edgeWidth).toBeCloseTo(2.9)
  })

  it("pitches the tone at 196·2^max(a, 0) Hz and shapes it by valence", () => {
    const semitone = 2 ** (1 / 12)
    const hz = (key: (typeof FEELING_KEYS)[number]): Array<number> =>
      feelingTone(key)
        .notes.filter(({ wave }) => wave !== "noise")
        .map((note) => note.hz)
    // flutter rises in a major triad from its register.
    const [root, third, fifth] = hz("flutter")
    expect(root).toBeCloseTo(196 * 2 ** 0.55)
    expect(third! / root!).toBeCloseTo(semitone ** 4)
    expect(fifth! / root!).toBeCloseTo(semitone ** 7)
    // cringe, at exactly v = −0.30, falls a semitone onto its register.
    const [from, to] = hz("cringe")
    expect(to).toBeCloseTo(196 * 2 ** 0.3)
    expect(from! / to!).toBeCloseTo(semitone)
    // chill is calm (a < 0), so it sits at the register's floor.
    expect(hz("chill")[1]).toBeCloseTo(196)
    // Only an agitated fall crashes; the reveal is the dun-dun.
    expect(
      FEELING_KEYS.filter((key) =>
        feelingTone(key).notes.some(({ wave }) => wave === "noise")
      )
    ).toEqual(["fury"])
    expect(feelingTone("twist").notes.map(({ wave }) => wave)).toEqual([
      "sawtooth",
      "sawtooth",
      "sawtooth",
    ])
    for (const key of FEELING_KEYS) {
      expect(feelingTone(key).length).toBeLessThan(1)
    }
  })

  it("swaps ground and ink only on a reveal", () => {
    const light = sessions.find(({ theme }) => theme.id === "light")!.roles
    const reveals = FEELING_KEYS.filter(
      (key) => feelingColors(key, light).reveal
    )
    expect(reveals).toEqual(["twist"])
    // The light session's ink becomes the twist's ground.
    expect(feelingColors("twist", light).ground[0]).toBeLessThan(0.3)
  })
})
