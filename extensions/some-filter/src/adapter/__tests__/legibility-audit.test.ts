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

  it("stops climbing once a fully opaque layer resolves, ignoring anything further out", () => {
    document.body.innerHTML =
      // If this outer gradient were consulted, the result would be
      // underdetermined -- it must not be, since the inner div is fully
      // opaque and the walk should stop there.
      '<div id="outer" style="background-image: linear-gradient(red, blue)">' +
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

  it("MIN_CONTRAST_RATIO matches WCAG 2.1 AA normal text (4.5:1)", () => {
    expect(MIN_CONTRAST_RATIO).toBe(4.5)
  })
})

describe("realizeLegibility", () => {
  it("tags every element sharing a violated key", () => {
    document.body.innerHTML = '<div id="a">x</div><div id="b">y</div>'
    const a = document.getElementById("a")
    const b = document.getElementById("b")
    if (a === null || b === null) throw new Error("fixture missing")

    realizeLegibility(
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

    realizeLegibility(actions, elementsByKey)

    const observed: Array<MutationRecord> = []
    const observer = new MutationObserver((records) => {
      observed.push(...records)
    })
    observer.observe(a, { attributes: true })

    realizeLegibility(actions, elementsByKey)

    expect(observer.takeRecords()).toEqual([])
    expect(observed).toEqual([])
    observer.disconnect()
  })
})
