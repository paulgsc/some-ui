import {
  buildForegroundRepairRule,
  decideForegroundRepairs,
  realizeForegroundRepairs,
  REPAIR_ATTR,
  repairedForeground,
  type RepairForegroundAction,
} from "@filter/adapter/foreground-repair"
import {
  auditLegibility,
  MIN_CONTRAST_RATIO,
  REPAIR_STYLE_ID,
  violatesContrast,
} from "@filter/adapter/legibility-audit"
import type { LegibilityAttr } from "@filter/adapter/legibility-audit"
import {
  contrastRatio,
  relativeLuminance,
  type RGBA,
} from "@filter/lib/content/color"
import { FG_LIGHT_MAX } from "@filter/lib/content/modify-colors"
import { afterEach, describe, expect, it } from "vitest"

const DARK_SURFACE: RGBA = [20 / 255, 20 / 255, 20 / 255, 1]
const BLACK: RGBA = [0, 0, 0, 1]

function attrs(
  entries: Record<string, LegibilityAttr>
): ReadonlyMap<string, LegibilityAttr> {
  return new Map(Object.entries(entries))
}

function luminanceOf([r, g, b]: RGBA): number {
  return relativeLuminance(r, g, b)
}

function cleanUp(): void {
  document.body.innerHTML = ""
  document.getElementById(REPAIR_STYLE_ID)?.remove()
  document.querySelectorAll(`[${REPAIR_ATTR}]`).forEach((el) => {
    el.removeAttribute(REPAIR_ATTR)
  })
  document.documentElement.style.backgroundColor = ""
  document.body.style.backgroundColor = ""
  document.body.style.color = ""
}

afterEach(cleanUp)

describe("repairedForeground", () => {
  it("lands on modifyForegroundColor's own lift when that already clears the floor", () => {
    // The overwhelmingly common case, and the one that keeps this channel's
    // repairs and theme-adapter.ts's co-located (#741) textCss in the same
    // colour regime: black text over a themed dark surface lifts to exactly
    // the achromatic band floor, which clears 4.5:1 comfortably.
    const repaired = repairedForeground(BLACK, DARK_SURFACE)

    expect(repaired).toEqual([0.62, 0.62, 0.62, 1])
  })

  it("climbs the band when the plain lift does not clear the floor", () => {
    // A mid-dark backdrop (luminance ≈ 0.08): the band floor only reaches
    // ≈ 3.0:1 against it, so the search must escalate rather than emit a
    // repair that is still a violation.
    const backdrop: RGBA = [80 / 255, 80 / 255, 80 / 255, 1]

    const floorOnly: RGBA = [0.62, 0.62, 0.62, 1]
    expect(
      contrastRatio(luminanceOf(floorOnly), luminanceOf(backdrop))
    ).toBeLessThan(MIN_CONTRAST_RATIO)

    const repaired = repairedForeground(BLACK, backdrop)
    expect(repaired).not.toBeNull()
    if (repaired === null) return

    expect(
      contrastRatio(luminanceOf(repaired), luminanceOf(backdrop))
    ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO)
    // Least-luminant-that-clears: one step below is still a violation, so
    // this is genuinely the first clearing value and not an overshoot.
    const oneStepDimmer: RGBA = [
      repaired[0] - 0.005,
      repaired[1] - 0.005,
      repaired[2] - 0.005,
      1,
    ]
    expect(
      contrastRatio(luminanceOf(oneStepDimmer), luminanceOf(backdrop))
    ).toBeLessThan(MIN_CONTRAST_RATIO)
    // κ_hi: never raw white, never past the band's own ceiling.
    expect(repaired[0]).toBeLessThanOrEqual(FG_LIGHT_MAX)
  })

  it("preserves hue and saturation", () => {
    const blue: RGBA = [0, 0, 120 / 255, 1]
    const repaired = repairedForeground(blue, DARK_SURFACE)

    expect(repaired).not.toBeNull()
    if (repaired === null) return
    // Blue stays the dominant channel — a hue-preserving lift, not a
    // generic grey token.
    expect(repaired[2]).toBeGreaterThan(repaired[0])
    expect(repaired[0]).toBeCloseTo(repaired[1], 10)
  })

  it("returns null when no colour in the band can clear the floor", () => {
    // Light-on-light: the only repairs this band can express make it worse.
    // Deliberately left to its `violated` diagnostic tag rather than
    // repainted to something still illegible — see the module header's own
    // disclosure.
    const lightGrey: RGBA = [200 / 255, 200 / 255, 200 / 255, 1]
    const white: RGBA = [1, 1, 1, 1]
    expect(violatesContrast(lightGrey, white)).toBe(true)

    expect(repairedForeground(lightGrey, white)).toBeNull()
  })

  it("returns null for a foreground too translucent for any lift to rescue", () => {
    const ghost: RGBA = [0, 0, 0, 0.04]
    expect(violatesContrast(ghost, DARK_SURFACE)).toBe(true)

    // Never silently forced opaque: making deliberately near-invisible text
    // solid is a larger intervention than this story's own scope.
    expect(repairedForeground(ghost, DARK_SURFACE)).toBeNull()
  })
})

describe("decideForegroundRepairs", () => {
  it("emits a repair for a violated key", () => {
    const actions = decideForegroundRepairs(
      attrs({
        "rgb(0, 0, 0)~rgb(20, 20, 20)": {
          foreground: BLACK,
          backdrop: DARK_SURFACE,
        },
      })
    )

    expect(actions).toEqual([
      {
        kind: "repair-foreground",
        key: "rgb(0, 0, 0)~rgb(20, 20, 20)",
        css: "rgb(158, 158, 158)",
      },
    ])
  })

  it("emits nothing for an already-legible key", () => {
    const actions = decideForegroundRepairs(
      attrs({
        legible: { foreground: [1, 1, 1, 1], backdrop: DARK_SURFACE },
      })
    )

    expect(actions).toEqual([])
  })

  it("never repairs an underdetermined channel", () => {
    const actions = decideForegroundRepairs(
      attrs({
        "unknown-fg": {
          foreground: "underdetermined",
          backdrop: DARK_SURFACE,
        },
        "unknown-bg": { foreground: BLACK, backdrop: "underdetermined" },
        "unknown-both": {
          foreground: "underdetermined",
          backdrop: "underdetermined",
        },
      })
    )

    expect(actions).toEqual([])
  })
})

describe("buildForegroundRepairRule", () => {
  it("out-specifies the co-located surface rule it can collide with", () => {
    const rule = buildForegroundRepairRule({
      kind: "repair-foreground",
      key: "rgb(0, 0, 0)~rgb(20, 20, 20)",
      css: "rgb(158, 158, 158)",
    })

    // The attribute selector appears twice (0-4-0) so the cascade never
    // falls through to <style> document order against
    // buildSurfaceColorRule's own 0-3-0 `color:…!important`.
    expect(
      rule.startsWith(
        '[data-sw-legibility-fix="rgb(0, 0, 0)~rgb(20, 20, 20)"]' +
          '[data-sw-legibility-fix="rgb(0, 0, 0)~rgb(20, 20, 20)"]'
      )
    ).toBe(true)
    expect(rule).toContain("color:rgb(158, 158, 158)!important")
    // Foreground only — this channel never emits a background, ever.
    expect(rule).not.toContain("background")
  })
})

describe("realizeForegroundRepairs", () => {
  const KEY = "rgb(0, 0, 0)~rgb(20, 20, 20)"
  const ACTION: RepairForegroundAction = {
    kind: "repair-foreground",
    key: KEY,
    css: "rgb(158, 158, 158)",
  }

  function carrier(): HTMLElement {
    document.body.innerHTML = '<div id="carrier">hi</div>'
    const el = document.getElementById("carrier")
    if (el === null) throw new Error("fixture missing")
    return el
  }

  it("tags the carrier and emits its rule", () => {
    const el = carrier()

    realizeForegroundRepairs(document.body, [ACTION], new Map([[KEY, [el]]]))

    expect(el.getAttribute(REPAIR_ATTR)).toBe(KEY)
    const style = document.getElementById(REPAIR_STYLE_ID)
    expect(style).not.toBeNull()
    expect(style?.getAttribute("data-my-ext")).toBe("")
    expect(style?.textContent).toBe(buildForegroundRepairRule(ACTION))
  })

  it("writes nothing at all on an unchanged second round (Theorem 7.2)", () => {
    const el = carrier()
    const elements = new Map([[KEY, [el]]])

    realizeForegroundRepairs(document.body, [ACTION], elements)
    const style = document.getElementById(REPAIR_STYLE_ID)
    const textNodeBefore = style?.firstChild

    realizeForegroundRepairs(document.body, [ACTION], elements)

    // `textContent =` replaces the child text node unconditionally, so node
    // identity is what actually proves no write happened — a value compare
    // would pass either way (#831).
    expect(document.getElementById(REPAIR_STYLE_ID)?.firstChild).toBe(
      textNodeBefore
    )
    expect(el.getAttribute(REPAIR_ATTR)).toBe(KEY)
  })

  it("reconciles a carrier that is no longer violated", () => {
    const el = carrier()
    realizeForegroundRepairs(document.body, [ACTION], new Map([[KEY, [el]]]))
    expect(el.hasAttribute(REPAIR_ATTR)).toBe(true)

    realizeForegroundRepairs(document.body, [], new Map())

    expect(el.hasAttribute(REPAIR_ATTR)).toBe(false)
    expect(document.getElementById(REPAIR_STYLE_ID)).toBeNull()
  })

  it("emits no rule for an action whose key resolves to no element", () => {
    carrier()

    realizeForegroundRepairs(document.body, [ACTION], new Map())

    expect(document.getElementById(REPAIR_STYLE_ID)).toBeNull()
  })
})

describe("the negative control (Gate-0 F-18) receives no repair", () => {
  it("does not tag a descendant that merely inherits its ancestor's colour", () => {
    // A non-allowlisted <div> with no colour declaration of its own, inside
    // an ancestor whose own explicit colour is already correct: it inherits
    // a legible foreground through plain CSS cascade and must receive no
    // tag and no action from this channel. Re-tagging it would be redundant
    // custody at best, and would override an already hue-matched inherited
    // colour with a generically calibrated one at worst.
    document.body.innerHTML =
      '<div id="ancestor" style="background-color: rgb(20, 20, 20); color: rgb(163, 163, 163)">' +
      '<div id="descendant">body copy</div>' +
      "</div>"
    const descendant = document.getElementById("descendant")
    if (descendant === null) throw new Error("fixture missing")

    const scan = auditLegibility(document.body)
    realizeForegroundRepairs(
      document.body,
      decideForegroundRepairs(scan.attrsByKey),
      scan.elementsByKey
    )

    expect(descendant.hasAttribute(REPAIR_ATTR)).toBe(false)
    expect(document.getElementById(REPAIR_STYLE_ID)).toBeNull()
  })
})
