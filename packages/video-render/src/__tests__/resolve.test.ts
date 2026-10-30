import { LOOKS, VOICES } from "@video-render/plans"
import { designOf, resolve } from "@video-render/resolve"
import { capture, cutList, series, shot } from "@video-render/testing"
import { describe, expect, it } from "vitest"

const tapped = shot("S2", {
  picture: capture(0, { cssWidth: 412, taps: [400, 1200] }),
})

describe("resolve", () => {
  it("takes each lever from the lowest layer that sets it", () => {
    const r = resolve(
      cutList([
        shot("S1"),
        { ...tapped, look: "lively" },
        shot("S3", {
          overrides: { transitionIn: "zoom", motion: { kind: "still" } },
        }),
      ]),
      series()
    )
    if (!r.ok) throw new Error(r.problems.join("\n"))
    const [first, second, third] = r.value.shots
    expect(first?.transitionIn).toBe("cut")
    expect(first?.motion).toEqual({ kind: "push-in", amount: 0.06 })
    expect(second?.transitionIn).toBe("slide-up")
    expect(second?.motion).toEqual({
      kind: "punch-in",
      at: [400, 1200],
      amount: 0.2,
    })
    expect(second?.cues).toEqual([
      { sound: "whoosh", atMs: 0 },
      { sound: "click", atMs: 400 },
      { sound: "click", atMs: 1200 },
    ])
    expect(third?.transitionIn).toBe("zoom")
    expect(third?.motion).toEqual({ kind: "still" })
    expect(r.value.music).toBe("under-voice")
  })

  it("offers at most four plans per decision, never a lever (ST6)", () => {
    expect(LOOKS.length).toBeLessThanOrEqual(4)
    expect(VOICES.length).toBeLessThanOrEqual(4)
  })

  it("holds a card still, and a lively scene with no taps", () => {
    const r = resolve(
      cutList([shot("S1", { picture: { kind: "card" } }), shot("S2")], {
        look: "lively",
      }),
      series()
    )
    expect(r.ok && r.value.shots.map((s) => s.motion.kind)).toEqual([
      "still",
      "still",
    ])
  })

  it("refuses what the series can't sound or the video doesn't pin", () => {
    const r = resolve(
      cutList([tapped], {
        look: "lively",
        series: { id: "fixture", version: 2 },
      }),
      series({ sounds: {}, music: undefined })
    )
    expect(r.ok ? [] : r.problems).toEqual([
      "the video pins version 2 of fixture, not 1",
      "S2: the series has no whoosh sound",
      "S2: the series has no click sound",
      "the music is up-between-lines, and the series has no music bed",
    ])
  })
})

describe("a burn-in's design", () => {
  const pinned = series({ designs: { captions: "gridiron" } })

  it("is its own when it names one, else its series version's", () => {
    expect(designOf({ kind: "captions", params: {} }, pinned)).toBe("gridiron")
    expect(
      designOf({ kind: "captions", design: "chalk", params: {} }, pinned)
    ).toBe("chalk")
  })

  it("is refused when neither names one", () => {
    const r = resolve(
      cutList([shot("S1")], { burnIns: [{ kind: "card", params: {} }] }),
      pinned
    )
    expect(r.ok ? [] : r.problems).toEqual([
      "the card burn-in names no design, and the series names none for it",
    ])
  })
})
