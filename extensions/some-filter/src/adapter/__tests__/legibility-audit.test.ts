import {
  auditLegibility,
  decideLegibility,
  LEGIBILITY_ATTR,
  MIN_CONTRAST_RATIO,
  realizeLegibility,
  resolveEffectiveBackdrop,
  type LegibilityAttr,
} from "@filter/adapter/legibility-audit"
import { afterEach, describe, expect, it } from "vitest"

function cleanUp(): void {
  document.body.innerHTML = ""
  document.documentElement.style.backgroundColor = ""
  document.body.style.backgroundColor = ""
  document.documentElement.style.backgroundImage = ""
  document.body.style.color = ""
  document.querySelectorAll(`[${LEGIBILITY_ATTR}]`).forEach((el) => {
    el.removeAttribute(LEGIBILITY_ATTR)
  })
}

afterEach(() => {
  cleanUp()
})

describe("resolveEffectiveBackdrop", () => {
  it("resolves a single opaque ancestor background directly", () => {
    document.body.innerHTML =
      '<div id="ancestor" style="background-color: rgb(10, 10, 10)">' +
      '<span id="carrier">hi</span>' +
      "</div>"
    const carrier = document.getElementById("carrier")
    if (carrier === null) throw new Error("fixture missing")

    expect(resolveEffectiveBackdrop(carrier)).toEqual([
      10 / 255,
      10 / 255,
      10 / 255,
      1,
    ])
  })

  it("alpha-composites a translucent own background over a solid ancestor", () => {
    document.body.innerHTML =
      '<div id="ancestor" style="background-color: rgb(0, 0, 0)">' +
      '<div id="carrier" style="background-color: rgba(255, 255, 255, 0.5)">hi</div>' +
      "</div>"
    const carrier = document.getElementById("carrier")
    if (carrier === null) throw new Error("fixture missing")

    const result = resolveEffectiveBackdrop(carrier)
    expect(result).not.toBe("underdetermined")
    if (result === "underdetermined") return
    // 50% white over black -> mid grey, fully opaque.
    expect(result[0]).toBeCloseTo(0.5, 1)
    expect(result[3]).toBe(1)
  })

  it("falls back to assumed white when no ancestor declares any background", () => {
    document.body.innerHTML = '<span id="carrier">hi</span>'
    const carrier = document.getElementById("carrier")
    if (carrier === null) throw new Error("fixture missing")

    expect(resolveEffectiveBackdrop(carrier)).toEqual([1, 1, 1, 1])
  })

  it("is underdetermined when an ancestor carries a gradient background-image", () => {
    document.body.innerHTML =
      '<div id="ancestor" style="background-image: linear-gradient(red, blue)">' +
      '<span id="carrier">hi</span>' +
      "</div>"
    const carrier = document.getElementById("carrier")
    if (carrier === null) throw new Error("fixture missing")

    expect(resolveEffectiveBackdrop(carrier)).toBe("underdetermined")
  })

  it("is underdetermined when an ancestor carries a real background-image (not just a gradient)", () => {
    document.body.innerHTML =
      '<div id="ancestor" style="background-image: url(photo.jpg)">' +
      '<span id="carrier">hi</span>' +
      "</div>"
    const carrier = document.getElementById("carrier")
    if (carrier === null) throw new Error("fixture missing")

    expect(resolveEffectiveBackdrop(carrier)).toBe("underdetermined")
  })

  it("is underdetermined when an ancestor carries a CSS filter", () => {
    document.body.innerHTML =
      '<div id="ancestor" style="background-color: rgb(0,0,0); filter: brightness(1.2)">' +
      '<span id="carrier">hi</span>' +
      "</div>"
    const carrier = document.getElementById("carrier")
    if (carrier === null) throw new Error("fixture missing")

    expect(resolveEffectiveBackdrop(carrier)).toBe("underdetermined")
  })

  it("is underdetermined when an ancestor carries a non-normal mix-blend-mode", () => {
    document.body.innerHTML =
      '<div id="ancestor" style="background-color: rgb(0,0,0); mix-blend-mode: multiply">' +
      '<span id="carrier">hi</span>' +
      "</div>"
    const carrier = document.getElementById("carrier")
    if (carrier === null) throw new Error("fixture missing")

    expect(resolveEffectiveBackdrop(carrier)).toBe("underdetermined")
  })

  it("stops accumulating color once a fully opaque layer resolves, never blending in anything further out", () => {
    // The inner layer's own opaque color must win outright -- not a blend
    // with "outer"'s own (different) color -- proving accumulation itself
    // stops at the first opaque layer. (Hazard-*checking* is a separate
    // concern that does keep climbing regardless -- see the filter-beyond-
    // opaque-layer test below, which is what the old, now-corrected version
    // of this test conflated the two with.)
    document.body.innerHTML =
      '<div id="outer" style="background-color: rgb(200, 200, 200)">' +
      '<div id="inner" style="background-color: rgb(20, 20, 20)">' +
      '<span id="carrier">hi</span>' +
      "</div></div>"
    const carrier = document.getElementById("carrier")
    if (carrier === null) throw new Error("fixture missing")

    expect(resolveEffectiveBackdrop(carrier)).toEqual([
      20 / 255,
      20 / 255,
      20 / 255,
      1,
    ])
  })

  it("is underdetermined when a filter sits on an ancestor *beyond* an already-opaque inner layer", () => {
    // Codex review (PR #1345): a filter recolors its entire rendered
    // subtree, not just its own background layer — an inner child being
    // fully opaque does not shield it from an outer filter's effect, so
    // this must not stop at "inner" the way the gradient case above
    // correctly does for a mere paint-order concern.
    document.body.innerHTML =
      '<div id="outer" style="filter: brightness(0)">' +
      '<div id="inner" style="background-color: rgb(255, 255, 255)">' +
      '<span id="carrier">hi</span>' +
      "</div></div>"
    const carrier = document.getElementById("carrier")
    if (carrier === null) throw new Error("fixture missing")

    expect(resolveEffectiveBackdrop(carrier)).toBe("underdetermined")
  })

  it("is NOT underdetermined when an ancestor's background-image is occluded by an opaque inner layer", () => {
    // Codex review, second round (PR #1345): unlike a filter, a plain
    // background-image is just a paint layer -- once something fully
    // opaque paints over it (closer to the carrier), it is genuinely
    // occluded, ordinary z-order. An earlier version of this fix
    // over-corrected by treating background-image the same as the
    // unoccludable group hazards above, which misclassified an ordinary
    // opaque-card-over-hero-image layout as underdetermined.
    document.body.innerHTML =
      '<div id="outer" style="background-image: url(hero.jpg)">' +
      '<div id="inner" style="background-color: rgb(20, 20, 20)">' +
      '<span id="carrier">hi</span>' +
      "</div></div>"
    const carrier = document.getElementById("carrier")
    if (carrier === null) throw new Error("fixture missing")

    expect(resolveEffectiveBackdrop(carrier)).toEqual([
      20 / 255,
      20 / 255,
      20 / 255,
      1,
    ])
  })

  it("is underdetermined when an ancestor's background-color uses unparseable CSS Color 4 syntax (Codex review round 4)", () => {
    // Codex's own example: an opaque oklch() background would otherwise be
    // silently skipped as "no color, keep climbing" -- hiding a fully
    // opaque, fully real layer and letting some ancestor further out (or
    // the assumed-white canvas fallback) "win" the resolved color instead.
    document.body.innerHTML =
      '<div id="ancestor" style="background-color: oklch(1 0 0)">' +
      '<span id="carrier">hi</span>' +
      "</div>"
    const carrier = document.getElementById("carrier")
    if (carrier === null) throw new Error("fixture missing")

    expect(resolveEffectiveBackdrop(carrier)).toBe("underdetermined")
  })

  it("is underdetermined when an ancestor has non-1 CSS opacity", () => {
    // Codex review (PR #1345): opacity < 1 composites the whole element
    // (background and text together) against what's behind it — a group
    // effect this module's per-layer background-color model can't resolve.
    document.body.innerHTML =
      '<div id="ancestor" style="background-color: rgb(255, 255, 255); opacity: 0.1">' +
      '<span id="carrier">hi</span>' +
      "</div>"
    const carrier = document.getElementById("carrier")
    if (carrier === null) throw new Error("fixture missing")

    expect(resolveEffectiveBackdrop(carrier)).toBe("underdetermined")
  })

  it("is not underdetermined for an explicit, spec-default opacity of 1", () => {
    document.body.innerHTML =
      '<div id="ancestor" style="background-color: rgb(10, 10, 10); opacity: 1">' +
      '<span id="carrier">hi</span>' +
      "</div>"
    const carrier = document.getElementById("carrier")
    if (carrier === null) throw new Error("fixture missing")

    expect(resolveEffectiveBackdrop(carrier)).toEqual([
      10 / 255,
      10 / 255,
      10 / 255,
      1,
    ])
  })
})

describe("auditLegibility", () => {
  it("finds a carrier with no own background whose explicit color sits over a themed ancestor (F-20)", () => {
    // "ancestor" itself declares no color of its own (jsdom's own unset
    // default computes to the "canvastext" keyword, not an rgb() value, so
    // it can never coincidentally match an explicit literal below) -- only
    // "carrier"'s own black is a genuine own-color candidate.
    document.body.innerHTML =
      '<div id="ancestor" style="background-color: rgb(13, 17, 23)">' +
      '<div id="carrier" style="color: rgb(0, 0, 0)">hi</div>' +
      "</div>"

    const { attrsByKey, elementsByKey } = auditLegibility(document.body)

    expect(attrsByKey.size).toBe(1)
    const key = [...attrsByKey.keys()][0]
    if (key === undefined) throw new Error("expected one legibility key")
    const attr = attrsByKey.get(key)
    if (attr === undefined) throw new Error("expected an attr for the key")
    expect(attr.foreground).toEqual([0, 0, 0, 1])
    expect(attr.backdrop).not.toBe("underdetermined")
    expect(elementsByKey.get(key)?.map((el) => el.id)).toEqual(["carrier"])
  })

  it("does not find a carrier with no explicit color of its own (plain inheritance)", () => {
    // Neither element declares its own color -- both must be excluded, not
    // just "carrier". (An ancestor that itself has an own explicit color
    // is exactly as valid a candidate as any other carrier; that is not
    // what this test is about — see the F-20 test above for that case.)
    document.body.innerHTML =
      '<div id="ancestor"><span id="carrier">hi</span></div>'

    const { attrsByKey } = auditLegibility(document.body)
    expect(attrsByKey.size).toBe(0)
  })

  it("skips extension-owned nodes and their descendants", () => {
    document.body.innerHTML =
      '<div data-my-ext><div id="inner" style="color: rgb(0,0,0)">hi</div></div>'

    const { attrsByKey } = auditLegibility(document.body)
    expect(attrsByKey.size).toBe(0)
  })

  it("skips an unrendered carrier", () => {
    document.body.innerHTML =
      '<div id="carrier" style="color: rgb(0,0,0); display: none">hi</div>'

    const { attrsByKey } = auditLegibility(document.body)
    expect(attrsByKey.size).toBe(0)
  })

  it("does not exclude an already-tagged data-sw-patched surface — a distinct relation from the vendor-evidence Sensor's own exclusion", () => {
    document.body.innerHTML =
      '<div data-sw-patched="x" style="background-color: rgb(13,17,23); color: rgb(0,0,0)">hi</div>'

    const { attrsByKey } = auditLegibility(document.body)
    expect(attrsByKey.size).toBe(1)
  })

  it("classifies an unparseable CSS Color 4 foreground as underdetermined rather than silently dropping the carrier", () => {
    // Codex review, second round (PR #1345): a real browser's
    // getComputedStyle can serialize `color` using oklch()/lab()/lch()/
    // color(display-p3 ...) syntax parseColor was never built to parse.
    // Confirmed directly against jsdom (which preserves the literal string
    // rather than rejecting the declaration): silently returning null here
    // would drop this carrier from candidacy entirely -- worse than
    // "underdetermined," since it would never even be audited.
    document.body.innerHTML =
      '<div id="carrier" style="color: oklch(0.5 0.2 30)">hi</div>'

    const { attrsByKey, elementsByKey } = auditLegibility(document.body)

    expect(attrsByKey.size).toBe(1)
    const key = [...attrsByKey.keys()][0]
    if (key === undefined) throw new Error("expected one legibility key")
    expect(attrsByKey.get(key)?.foreground).toBe("underdetermined")
    expect(elementsByKey.get(key)?.map((el) => el.id)).toEqual(["carrier"])
  })

  it("does not flag a carrier whose color is explicitly transparent (invisible, not illegible)", () => {
    document.body.innerHTML =
      '<div id="carrier" style="color: transparent">hi</div>'

    const { attrsByKey } = auditLegibility(document.body)
    expect(attrsByKey.size).toBe(0)
  })

  it("flags an explicit inline color that coincidentally matches its parent's (escape route 2, Codex review round 3)", () => {
    // "outer" has no color of its own -- it genuinely inherits black from
    // body, so it must NOT itself become a candidate. "carrier"'s own
    // inline color happens to equal that exact same inherited value
    // (Codex's own example: a nested control explicitly repeating its
    // container's color for visual consistency) -- computed-value equality
    // alone cannot tell that apart from plain inheritance, so an inline
    // style.color is checked directly instead.
    document.body.style.color = "rgb(0, 0, 0)"
    document.body.innerHTML =
      '<div id="outer">' +
      '<div id="carrier" style="color: rgb(0, 0, 0); background: white">hi</div>' +
      "</div>"

    const { attrsByKey, elementsByKey } = auditLegibility(document.body)

    expect(attrsByKey.size).toBe(1)
    const key = [...attrsByKey.keys()][0]
    if (key === undefined) throw new Error("expected one legibility key")
    expect(attrsByKey.get(key)?.foreground).toEqual([0, 0, 0, 1])
    expect(elementsByKey.get(key)?.map((el) => el.id)).toEqual(["carrier"])
  })

  it("does not flag plain inheritance just because an ancestor has an explicit color", () => {
    // The inline-style check is per-element, not a blanket "an ancestor
    // has an explicit color -> everything under it is a candidate" -- a
    // carrier with no inline style of its own must still be excluded.
    document.body.style.color = "rgb(0, 0, 0)"
    document.body.innerHTML =
      '<div id="outer"><span id="carrier">hi</span></div>'

    const { attrsByKey } = auditLegibility(document.body)
    expect(attrsByKey.size).toBe(0)
  })

  it("skips a carrier whose own display is not none but sits inside a display:none ancestor (Codex review round 3)", () => {
    // A real browser's getComputedStyle reports a descendant's *own*
    // computed display (here, the UA default "block") regardless of an
    // ancestor's display:none -- confirmed as standard behavior, not a
    // jsdom quirk. Without walking ancestors, this carrier would be
    // wrongly treated as rendered.
    document.body.innerHTML =
      '<div style="display: none">' +
      '<div id="carrier" style="color: rgb(0,0,0)">hi</div>' +
      "</div>"

    const { attrsByKey } = auditLegibility(document.body)
    expect(attrsByKey.size).toBe(0)
  })

  it("classifies a near-invisible explicit foreground as a candidate rather than dropping it (Codex review round 3)", () => {
    // rgba(0,0,0,0.04) is below parseColor's own 0.05 near-invisible
    // cutoff (correct for background evidence) but is not negligible as a
    // *foreground* -- composited over any backdrop it renders essentially
    // as that backdrop's own color, which is systematically close to a
    // real 1:1 contrast violation.
    document.body.innerHTML =
      '<div id="carrier" style="color: rgba(0, 0, 0, 0.04)">hi</div>'

    const { attrsByKey, elementsByKey } = auditLegibility(document.body)

    expect(attrsByKey.size).toBe(1)
    const key = [...attrsByKey.keys()][0]
    if (key === undefined) throw new Error("expected one legibility key")
    expect(attrsByKey.get(key)?.foreground).toEqual([0, 0, 0, 0.04])
    expect(elementsByKey.get(key)?.map((el) => el.id)).toEqual(["carrier"])
  })
})

describe("decideLegibility", () => {
  it("flags a violated pair below the WCAG AA minimum", () => {
    const attrsByKey = new Map<string, LegibilityAttr>([
      ["k", { foreground: [0, 0, 0, 1], backdrop: [0.05, 0.05, 0.05, 1] }],
    ])

    const actions = decideLegibility(attrsByKey)
    expect(actions).toEqual([
      { kind: "tag-legibility", key: "k", verdict: "violated" },
    ])
  })

  it("emits nothing for a pair at/above the WCAG AA minimum", () => {
    const attrsByKey = new Map<string, LegibilityAttr>([
      ["k", { foreground: [1, 1, 1, 1], backdrop: [0, 0, 0, 1] }],
    ])

    expect(decideLegibility(attrsByKey)).toEqual([])
  })

  it("flags underdetermined backdrops rather than silently passing them", () => {
    const attrsByKey = new Map<string, LegibilityAttr>([
      ["k", { foreground: [0, 0, 0, 1], backdrop: "underdetermined" }],
    ])

    expect(decideLegibility(attrsByKey)).toEqual([
      { kind: "tag-legibility", key: "k", verdict: "underdetermined" },
    ])
  })

  it("flags an underdetermined foreground (e.g. an unparseable CSS Color 4 value) even with a fully resolvable backdrop", () => {
    const attrsByKey = new Map<string, LegibilityAttr>([
      ["k", { foreground: "underdetermined", backdrop: [1, 1, 1, 1] }],
    ])

    expect(decideLegibility(attrsByKey)).toEqual([
      { kind: "tag-legibility", key: "k", verdict: "underdetermined" },
    ])
  })

  it("MIN_CONTRAST_RATIO matches WCAG 2.1 AA normal text (4.5:1)", () => {
    expect(MIN_CONTRAST_RATIO).toBe(4.5)
  })

  it("composites a translucent own foreground over the backdrop before measuring contrast", () => {
    // Codex review (PR #1345): rgba(0,0,0,0.5) over white renders as
    // mid-grey (~4:1), not the opaque-black-vs-white 21:1 a naive read of
    // the raw foreground channels would report — and 4:1 is a real
    // violation of the 4.5:1 floor that measuring raw channels would miss
    // entirely.
    const attrsByKey = new Map<string, LegibilityAttr>([
      ["k", { foreground: [0, 0, 0, 0.5], backdrop: [1, 1, 1, 1] }],
    ])

    expect(decideLegibility(attrsByKey)).toEqual([
      { kind: "tag-legibility", key: "k", verdict: "violated" },
    ])
  })

  it("flags a near-invisible foreground as violated — it composites toward the backdrop it sits on", () => {
    // rgba(0,0,0,0.04) over white renders as essentially white-on-white.
    const attrsByKey = new Map<string, LegibilityAttr>([
      ["k", { foreground: [0, 0, 0, 0.04], backdrop: [1, 1, 1, 1] }],
    ])

    expect(decideLegibility(attrsByKey)).toEqual([
      { kind: "tag-legibility", key: "k", verdict: "violated" },
    ])
  })
})

describe("realizeLegibility", () => {
  it("tags every element sharing a violated key", () => {
    document.body.innerHTML = '<div id="a">x</div><div id="b">y</div>'
    const a = document.getElementById("a")
    const b = document.getElementById("b")
    if (a === null || b === null) throw new Error("fixture missing")

    realizeLegibility(
      document.body,
      [{ kind: "tag-legibility", key: "k", verdict: "violated" }],
      new Map([["k", [a, b]]])
    )

    expect(a.getAttribute(LEGIBILITY_ATTR)).toBe("violated")
    expect(b.getAttribute(LEGIBILITY_ATTR)).toBe("violated")
  })

  it("is a zero-write no-op on the second call with an unchanged verdict (#831-style zero churn)", () => {
    document.body.innerHTML = '<div id="a">x</div>'
    const a = document.getElementById("a")
    if (a === null) throw new Error("fixture missing")

    const actions = [
      {
        kind: "tag-legibility" as const,
        key: "k",
        verdict: "violated" as const,
      },
    ]
    const elementsByKey = new Map([["k", [a]]])

    realizeLegibility(document.body, actions, elementsByKey)

    const observed: Array<MutationRecord> = []
    const observer = new MutationObserver((records) => {
      observed.push(...records)
    })
    observer.observe(a, { attributes: true })

    realizeLegibility(document.body, actions, elementsByKey)

    expect(observer.takeRecords()).toEqual([])
    expect(observed).toEqual([])
    observer.disconnect()
  })

  it("clears a stale tag once a previously-violated element is no longer in the new actions (Codex review, PR #1345)", () => {
    document.body.innerHTML = '<div id="a">x</div>'
    const a = document.getElementById("a")
    if (a === null) throw new Error("fixture missing")

    realizeLegibility(
      document.body,
      [{ kind: "tag-legibility", key: "k", verdict: "violated" }],
      new Map([["k", [a]]])
    )
    expect(a.getAttribute(LEGIBILITY_ATTR)).toBe("violated")

    // A later round: "a" is no longer violated (it converged, or dropped
    // out of candidacy entirely) — decideLegibility emits nothing for it,
    // by design. The stale tag must not survive.
    realizeLegibility(document.body, [], new Map())

    expect(a.hasAttribute(LEGIBILITY_ATTR)).toBe(false)
  })

  it("leaves an untagged element's unrelated attributes alone while clearing only the legibility tag", () => {
    document.body.innerHTML = '<div id="a" data-keep="yes">x</div>'
    const a = document.getElementById("a")
    if (a === null) throw new Error("fixture missing")

    realizeLegibility(
      document.body,
      [{ kind: "tag-legibility", key: "k", verdict: "underdetermined" }],
      new Map([["k", [a]]])
    )
    realizeLegibility(document.body, [], new Map())

    expect(a.hasAttribute(LEGIBILITY_ATTR)).toBe(false)
    expect(a.getAttribute("data-keep")).toBe("yes")
  })
})
