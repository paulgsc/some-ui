import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createHypothesis } from "@some-extension/transport/estimator/hypothesis"
import { describe, expect, it } from "vitest"

import { parseColor, relativeLuminance } from "../../lib/content/color"
import type { SurfaceAttr, SurfaceKey } from "../contracts"
import { SWATCHES } from "../swatches"
import { decide } from "../theme-adapter"

const swatch = SWATCHES.default

/** Builds a SurfaceAttr the same way S1 traces it: parseColor + relativeLuminance. */
function attrFor(css: string, opacity = 1): SurfaceAttr {
  const color = parseColor(css)
  if (color === null) throw new Error(`unparseable fixture color: ${css}`)
  return {
    color,
    luminance: relativeLuminance(color[0], color[1], color[2]),
    opacity,
  }
}

describe("decide — Axiom D.1 structural checks", () => {
  it("contains no DOM-mutating call or getComputedStyle", () => {
    const path = join(process.cwd(), "src/adapter/theme-adapter.ts")
    // Strip comments first — the module's own doc comments discuss (and
    // rule out) getComputedStyle/document by name; only code should be
    // checked for an actual reference.
    const code = readFileSync(path, "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")

    expect(code).not.toMatch(/getComputedStyle/)
    expect(code).not.toMatch(/\bdocument\./)
  })
})

describe("decide — null swatch", () => {
  it("returns ∅ regardless of hypothesis contents", () => {
    const h = createHypothesis<SurfaceKey, SurfaceAttr>()
    h.set("rgb(255, 255, 255)", attrFor("rgb(255, 255, 255)"))
    expect(decide(h, null)).toEqual([])
  })
})

describe("decide — purity", () => {
  it("returns the identical action set, in the same order, across repeated calls", () => {
    const h = createHypothesis<SurfaceKey, SurfaceAttr>()
    h.set("rgb(255, 255, 255)", attrFor("rgb(255, 255, 255)"))
    h.set("rgb(90, 90, 90)", attrFor("rgb(90, 90, 90)"))
    h.set("rgb(13, 17, 23)", attrFor("rgb(13, 17, 23)"))

    const first = decide(h, swatch)
    const second = decide(h, swatch)

    expect(second).toEqual(first)
  })
})

describe("decide — no bright surfaces", () => {
  it("still activates the static theme layer for an empty hypothesis (no per-surface actions)", () => {
    const h = createHypothesis<SurfaceKey, SurfaceAttr>()
    expect(decide(h, swatch)).toEqual([
      { kind: "activate-theme", swatchId: swatch.id },
    ])
  })

  it("emits no per-surface action for mid-luminance (untouched-band) evidence", () => {
    // Paired with a bright anchor so the page-level verdict (below) doesn't
    // also fire and mask the per-surface question this test asks; only the
    // "mid" key's own actions are inspected.
    const h = createHypothesis<SurfaceKey, SurfaceAttr>()
    h.set("anchor", attrFor("rgb(255, 255, 255)"))
    h.set("mid", attrFor("rgb(90, 90, 90)"))

    const actions = decide(h, swatch).filter(
      (a) => "key" in a && a.key === "mid"
    )
    expect(actions).toEqual([])
  })
})

describe("decide — mixed page", () => {
  it("emits tag+emit for light surfaces and tag-only for preserve-band surfaces", () => {
    const h = createHypothesis<SurfaceKey, SurfaceAttr>()
    h.set("light", attrFor("rgb(255, 255, 255)"))
    h.set("near-black", attrFor("rgb(13, 17, 23)"))

    const actions = decide(h, swatch)

    expect(actions).toEqual([
      { kind: "activate-theme", swatchId: swatch.id },
      { kind: "tag-surface", key: "light", role: "surface" },
      {
        kind: "emit-surface-color",
        key: "light",
        css: expect.any(String),
      },
      { kind: "tag-surface", key: "near-black", role: "preserve" },
    ])
  })

  it("skips near-transparent evidence regardless of luminance", () => {
    const h = createHypothesis<SurfaceKey, SurfaceAttr>()
    h.set("glass", attrFor("rgba(255, 255, 255, 0.05)", 0.05))
    expect(decide(h, swatch)).toEqual([
      { kind: "activate-theme", swatchId: swatch.id },
    ])
  })
})

describe("decide — page-level already-dark verdict", () => {
  it("withholds every per-surface action and emits restore-native when the mean luminance reads dark (>= 3 evidenced keys)", () => {
    const h = createHypothesis<SurfaceKey, SurfaceAttr>()
    // Every evidenced key is near-black; classifyPage()'s reframe (detect())
    // would call this page already dark. Three distinct keys, at/above
    // MIN_EVIDENCE_FOR_DARK_VERDICT, so the verdict is actually trusted.
    h.set("a", attrFor("rgb(13, 17, 23)"))
    h.set("b", attrFor("rgb(5, 5, 5)"))
    h.set("c", attrFor("rgb(10, 10, 10)"))

    expect(decide(h, swatch)).toEqual([{ kind: "restore-native" }])
  })

  it("themes normally when the mean luminance reads light", () => {
    const h = createHypothesis<SurfaceKey, SurfaceAttr>()
    h.set("a", attrFor("rgb(255, 255, 255)"))

    const actions = decide(h, swatch)
    expect(actions.some((a) => a.kind === "restore-native")).toBe(false)
  })

  it("does NOT emit restore-native from a sparse (< 3 keys) dark-reading sample, even if their mean is dark", () => {
    // Guards against a real failure mode: a heavy client-rendered page can
    // easily have only one or two dark chrome/skeleton elements evidenced
    // early in hydration, well before its actual (light) body content has
    // rendered. A reactive rescan firing on exactly that sparse a sample
    // must not conclude "page is already dark" and strip the theme --
    // restore-native's veil-drop is immediate and uncorrected once more
    // (light) evidence later arrives. Two near-black keys alone -- below
    // MIN_EVIDENCE_FOR_DARK_VERDICT -- must be treated as inconclusive, the
    // same "insufficient evidence -> assume light" bias zero evidence
    // already gets.
    const h = createHypothesis<SurfaceKey, SurfaceAttr>()
    h.set("a", attrFor("rgb(13, 17, 23)"))
    h.set("b", attrFor("rgb(5, 5, 5)"))

    const actions = decide(h, swatch)
    expect(actions.some((a) => a.kind === "restore-native")).toBe(false)
    expect(actions.some((a) => a.kind === "activate-theme")).toBe(true)
  })
})

describe("decide — golden fixture (parity with pre-refactor classifyElement)", () => {
  const cases: ReadonlyArray<{
    readonly name: string
    readonly css: string
    readonly expected: "surface" | "preserve" | "none"
  }> = [
    { name: "white", css: "rgb(255, 255, 255)", expected: "surface" },
    { name: "light gray", css: "rgb(200, 200, 200)", expected: "surface" },
    {
      name: "near-black (today's bg-0)",
      css: "rgb(13, 17, 23)",
      expected: "preserve",
    },
    { name: "dark gray", css: "rgb(45, 45, 45)", expected: "preserve" },
    { name: "mid gray (untouched)", css: "rgb(90, 90, 90)", expected: "none" },
    {
      name: "mid gray, upper band",
      css: "rgb(130, 130, 130)",
      expected: "none",
    },
  ]

  for (const { name, css, expected } of cases) {
    it(`classifies "${name}" (${css}) as ${expected}`, () => {
      // Paired with a bright anchor (a distinct key) so the page-level
      // verdict never masks the per-surface question — only actions for
      // the "k" key are inspected.
      const h = createHypothesis<SurfaceKey, SurfaceAttr>()
      h.set("anchor", attrFor("rgb(255, 255, 255)"))
      h.set("k", attrFor(css))

      const roles = decide(h, swatch)
        .filter(
          (a): a is Extract<typeof a, { kind: "tag-surface" }> =>
            a.kind === "tag-surface" && a.key === "k"
        )
        .map((a) => a.role)

      if (expected === "none") {
        expect(roles).toEqual([])
      } else {
        expect(roles).toEqual([expected])
      }
    })
  }
})
