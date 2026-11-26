/**
 * The roles a character plays and the colour its feeling gives it (HOST7,
 * #3531): every role of each character drawn to the same bytes for the same
 * beat, seed and t; each role a picture of its own; the tint over the role's
 * theme, never instead of it; and the signs beside the figure untouched.
 */
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"

import type { Area, Beat, HostCharacter, SHARED_EMOTIONS } from "../host"
import { EMOTIONS, HOST_CHARACTERS, hostAt, hostSvg } from "../host"
import {
  COSTUME_PIECES,
  EMOTION_TINTS,
  mixHex,
  PROPS,
  ROLE_LOOKS,
  roleOf,
  rolesOf,
  THEMES,
  TINT_RISE_MS,
  tintAmountAt,
  type Role,
} from "../host-role"

const AREA: Area = { x: 96, y: 86, width: 1728, height: 864 }

/** The emotions both characters have, which these tests draw. */
type Shared = (typeof SHARED_EMOTIONS)[number]

const beat = (
  who: HostCharacter,
  role: Role | undefined,
  emotion: Shared = "neutral"
): Beat => {
  const frame = {
    atMs: 0,
    emotion,
    shot: "medium",
    placement: "center",
    speaking: false,
  } as const
  if (who === "mochi") {
    const r = roleOf("mochi", role)
    return r === undefined
      ? { ...frame, character: "mochi" }
      : { ...frame, character: "mochi", role: r }
  }
  const r = roleOf("tin-owlet", role)
  return r === undefined
    ? { ...frame, character: "tin-owlet" }
    : { ...frame, character: "tin-owlet", role: r }
}

const draw = (b: Beat, tMs: number): string =>
  hostSvg(b, tMs, 7, 200, { x: 0, y: 0 })

const sha = (svg: string): string =>
  createHash("sha256").update(svg).digest("hex").slice(0, 16)

describe("each character's roles", () => {
  it("dress every role from the closed sets, the everyday self first and bare", () => {
    for (const who of HOST_CHARACTERS) {
      expect(rolesOf(who)[0]).toBe("default")
      const looks: Readonly<
        Record<
          string,
          { theme: string; costume: ReadonlyArray<string>; prop?: string }
        >
      > = ROLE_LOOKS[who]
      expect(Object.keys(looks)).toEqual([...rolesOf(who)])
      expect(looks.default).toEqual({ theme: THEMES[who][0], costume: [] })
      for (const look of Object.values(looks)) {
        expect(THEMES[who]).toContain(look.theme)
        for (const piece of look.costume)
          expect(COSTUME_PIECES).toContain(piece)
        if (look.prop !== undefined) expect(PROPS).toContain(look.prop)
      }
    }
  })

  it("reads a role back from an address, and nothing else", () => {
    expect(roleOf("mochi", "coach")).toBe("coach")
    expect(roleOf("mochi", "goalie")).toBeUndefined()
    expect(roleOf("tin-owlet", 3)).toBeUndefined()
  })

  it("draws the everyday self exactly as a beat with no role", () => {
    for (const who of HOST_CHARACTERS) {
      for (const emotion of ["neutral", "angry"] as const) {
        expect(draw(beat(who, "default", emotion), 1300)).toBe(
          draw(beat(who, undefined, emotion), 1300)
        )
      }
    }
  })

  it("draws each role as a picture of its own, the same bytes every time", () => {
    for (const who of HOST_CHARACTERS) {
      const svgs = rolesOf(who).map((role) => draw(beat(who, role), 1300))
      expect(new Set(svgs).size).toBe(svgs.length)
      expect(rolesOf(who).map((role) => draw(beat(who, role), 1300))).toEqual(
        svgs
      )
    }
    const pinned = Object.fromEntries(
      HOST_CHARACTERS.flatMap((who) =>
        rolesOf(who).flatMap((role) =>
          (["neutral", "angry", "hungry"] as const).map((emotion) => [
            `${who} ${role} ${emotion}`,
            sha(draw(beat(who, role, emotion), 1300)),
          ])
        )
      )
    )
    expect(pinned).toMatchSnapshot()
  })

  it("wears the costume inside the figure, so it moves with the loop's pose", () => {
    const svg = draw(beat("mochi", "coach", "happy"), 450)
    const figure = svg.indexOf('data-part="figure"')
    expect(figure).toBeGreaterThan(-1)
    for (const part of ["costume-cap", "costume-whistle"]) {
      expect(svg.indexOf(`data-part="${part}"`)).toBeGreaterThan(figure)
    }
    expect(svg).not.toContain('data-part="prop-')
  })

  it("carries a role through hostAt, as a scene draws it", () => {
    const frame = hostAt([beat("tin-owlet", "analyst")], 7, 1000, AREA)
    expect(frame?.svg).toContain('data-part="costume-tie"')
    expect(frame?.svg).toContain('data-part="prop-clipboard"')
  })
})

describe("colour by feeling", () => {
  it("has a tint, or none, for every emotion, and no other", () => {
    const all = new Set(HOST_CHARACTERS.flatMap((who) => [...EMOTIONS[who]]))
    expect(new Set(Object.keys(EMOTION_TINTS))).toEqual(all)
  })

  it("rises from nothing over the loop's first moments, and angry throbs", () => {
    expect(tintAmountAt("angry", 0)).toBe(0)
    expect(tintAmountAt("neutral", 5000)).toBe(0)
    expect(tintAmountAt("hungry", TINT_RISE_MS)).toBeCloseTo(
      EMOTION_TINTS.hungry.amount
    )
    const throb = [1000, 1200, 1400, 1600].map((t) => tintAmountAt("angry", t))
    expect(new Set(throb).size).toBe(throb.length)
  })

  it("mixes over the role's theme rather than replacing it", () => {
    const angryAnalyst = draw(beat("mochi", "analyst", "angry"), 2000)
    const angryFan = draw(beat("mochi", "fan", "angry"), 2000)
    const amount = tintAmountAt("angry", 2000)
    const flushed = (body: string): string =>
      mixHex(body, EMOTION_TINTS.angry.toward, amount)
    // The body's middle stop: slate's and team's, each flushed.
    expect(angryAnalyst).toContain(`stop-color="${flushed("#a3b2c4")}"`)
    expect(angryFan).toContain(`stop-color="${flushed("#e4573f")}"`)
    expect(angryAnalyst).not.toBe(angryFan)
  })

  it("leaves the signs beside the figure, and the costume's cloth, their own colours", () => {
    // Each sign below shares its colour with a named colour the role
    // repaints (Mochi's rim and shade, Tin Bird's lens), so only a swap kept
    // to the figure leaves it standing.
    const mochi = draw(beat("mochi", "fan", "angry"), 2000)
    expect(mochi).not.toContain('stop-color="#fff2cf"')
    expect(mochi).toContain('fill="#fff2cf"')
    expect(mochi).toContain('stroke="#c9781f"')
    expect(mochi).toContain('fill="#1f2f5c"')
    const tin = draw(beat("tin-owlet", "analyst", "perplexed"), 2000)
    expect(tin).toContain('stroke="#4ff0d8"')
    expect(tin).not.toContain('stop-color="#4ff0d8"')
  })

  it("throbs a whole number of times in the Cast wing's 6.8 s loop", () => {
    // The loop starts every feeling again, rise included; the throb's own
    // phase just never jumps at the seam.
    const beats = 6800 / (1000 * EMOTION_TINTS.angry.pulse.beatS)
    expect(beats).toBeCloseTo(Math.round(beats))
  })

  it("mixes colours channel by channel, rounded", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080")
    expect(mixHex("#123456", "#abcdef", 0)).toBe("#123456")
    expect(mixHex("#123456", "#abcdef", 1)).toBe("#abcdef")
  })
})
