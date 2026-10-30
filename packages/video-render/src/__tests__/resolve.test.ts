import { resolve } from "@video-render/resolve"
import { cutList, series, shot } from "@video-render/testing"
import { describe, expect, it } from "vitest"

const tapped = shot("S2", {
  picture: {
    kind: "capture",
    source: "captures/walk.mp4",
    inMs: 0,
    speed: 1,
    cssWidth: 412,
    framing: { mode: "crop", zoom: 1, x: 0, y: 0 },
    taps: [400, 1200],
  },
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
