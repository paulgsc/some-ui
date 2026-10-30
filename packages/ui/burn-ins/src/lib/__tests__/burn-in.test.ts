/** @vitest-environment node */
import { prepare, runtimeMs, type Prepared } from "@burn-ins/lib/burn-in"
import { SAMPLE } from "@burn-ins/lib/captions/sample"
import { THEMES } from "@burn-ins/lib/captions/theme"
import { captionsFor, runtimeOf } from "@burn-ins/lib/captions/timing"
import { SAMPLES } from "@burn-ins/lib/samples"
import { describe, expect, it } from "vitest"

const ready = (kind: string, design: string, params: unknown): Prepared => {
  const p = prepare({ kind, design, params })
  if (!p.ok) throw new Error(p.problems.join("; "))
  return p.value
}

describe("a burn-in", () => {
  it("lasts as long as its captions, or as long as its scene", () => {
    expect(runtimeMs(ready("captions", "chalk", SAMPLES.captions))).toBe(
      runtimeOf(captionsFor(SAMPLE, THEMES.chalk))
    )
    expect(runtimeMs(ready("card", "v1", SAMPLES.card))).toBeNull()
  })

  it("refuses an unknown kind or design, naming it", () => {
    expect(prepare({ kind: "sticker", design: "v1", params: {} })).toEqual({
      ok: false,
      problems: ["the sticker burn-in (v1): no such kind"],
    })
    expect(
      prepare({
        kind: "headline",
        design: "gridiron",
        params: SAMPLES.headline,
      })
    ).toEqual({
      ok: false,
      problems: ["the headline burn-in (gridiron): no such design"],
    })
  })

  it("refuses params its kind can't draw, with every reason", () => {
    const p = prepare({ kind: "headline", design: "v1", params: { line: 3 } })
    expect(p.ok).toBe(false)
    if (p.ok) return
    expect(p.problems.join("\n")).toMatch(/headline/)
    expect(p.problems.join("\n")).toMatch(/line/)
  })

  it("refuses text that doesn't fit rather than cutting it", () => {
    const long = Array.from({ length: 400 }, () => "word").join(" ")
    expect(
      prepare({
        kind: "card",
        design: "v1",
        params: { headline: "A card", body: long },
      })
    ).toEqual({
      ok: false,
      problems: ["the card burn-in (v1): the body doesn't fit"],
    })
    expect(
      prepare({ kind: "headline", design: "v1", params: { headline: long } })
    ).toEqual({
      ok: false,
      problems: ["the headline burn-in (v1): the headline doesn't fit"],
    })
  })

  it("measures wide letters as wide as they draw", () => {
    // 32 W's are about 1357 px at 60 px in Barlow Condensed 800: too wide
    // for the header even at the 44 px floor.
    expect(
      prepare({
        kind: "headline",
        design: "v1",
        params: { headline: "W".repeat(32) },
      })
    ).toEqual({
      ok: false,
      problems: ["the headline burn-in (v1): the headline doesn't fit"],
    })
  })

  it("takes the params the renderer's v1 converter writes", () => {
    // packages/video-render/src/timeline-v1.ts
    expect(
      prepare({
        kind: "headline",
        design: "v1",
        params: {
          kicker: "",
          headline: "A scene",
          line: "Recorded on my phone",
        },
      }).ok
    ).toBe(true)
    expect(
      prepare({
        kind: "card",
        design: "v1",
        params: {
          kicker: "EP 3",
          headline: "Slot",
          body: "The clip",
          note: "",
          slot: true,
        },
      }).ok
    ).toBe(true)
  })

  it("keeps the header's words to one row each, shrinking a long headline", () => {
    const p = ready("headline", "v1", {
      headline: "Burned-in words now come from one renderer",
    })
    if (p.kind !== "headline") throw new Error("not a headline")
    const head = p.frame.blocks.find(
      (b) => b.style.weight === 800 && b.box.y === 104
    )
    expect(head?.rows).toHaveLength(1)
    expect(head?.style.sizePx).toBeLessThan(60)
  })
})
