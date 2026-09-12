import type { FilterAction, SurfaceKey } from "@filter/adapter/contracts"
import {
  clearShadowSurfaceState,
  MAX_CACHED_SHEETS,
  realizeShadowColors,
  shadowRealizationIntact,
  tagSurfaceElements,
} from "@filter/adapter/shadow-actuator"
import { SWATCHES } from "@filter/adapter/swatches"
import { compensateSwatch } from "@filter/lib/content/theme-apply"
import { afterEach, describe, expect, it } from "vitest"

const defaultSwatch = SWATCHES.default
const otherSwatch = SWATCHES["cool-blue-gray"]

function shadowRoot(): ShadowRoot {
  const host = document.createElement("div")
  document.body.appendChild(host)
  return host.attachShadow({ mode: "open" })
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("realizeShadowColors — adopts a per-color sheet", () => {
  it("adopts one CSSStyleSheet carrying the emitted rule", () => {
    const root = shadowRoot()
    const key: SurfaceKey = "rgb(255, 255, 255)"
    const actions: ReadonlyArray<FilterAction> = [
      { kind: "emit-surface-color", key, css: "rgb(10, 10, 20)" },
    ]

    realizeShadowColors(actions, root, null)

    expect(root.adoptedStyleSheets).toHaveLength(1)
    const sheet = root.adoptedStyleSheets[0]
    expect(sheet).toBeDefined()
    if (sheet === undefined) return
    expect(sheet.cssRules).toHaveLength(1)
    expect(sheet.cssRules[0]?.cssText).toContain(`data-sw-patched="${key}"`)
    expect(sheet.cssRules[0]?.cssText).toContain("rgb(10, 10, 20)")
  })

  it("adopts nothing for an action list with no emit-surface-color members and no activate-theme", () => {
    const root = shadowRoot()
    realizeShadowColors(
      [{ kind: "tag-surface", key: "rgb(1,2,3)", role: "surface" }],
      root,
      null
    )
    // jsdom (this test's own environment) never initializes
    // adoptedStyleSheets to [] the way a real ShadowRoot does — see
    // shadow-actuator.ts's own header.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    expect(root.adoptedStyleSheets ?? []).toHaveLength(0)
  })
})

describe("realizeShadowColors — the shared static layer (bot-found, this story's own review)", () => {
  it("adopts the static text/border/form/etc. layer whenever activate-theme is present, even with no emit-surface-color actions", () => {
    const root = shadowRoot()
    realizeShadowColors(
      [{ kind: "activate-theme", swatchId: "default" }],
      root,
      defaultSwatch
    )

    // The shared static layer plus this swatch's own :host token rule (see
    // buildHostTokenRule's own doc comment for why the tokens can't just be
    // inherited from the document's :root).
    expect(root.adoptedStyleSheets).toHaveLength(2)
    const cssText = [...root.adoptedStyleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .map((r) => r.cssText)
      .join("\n")
    // Spot-check a couple of the rules theme-apply.ts's DARK_THEME_BODY_RULES
    // carries — the exact set is that module's own concern, not duplicated
    // here rule-by-rule.
    expect(cssText).toContain("var(--sw-text-1)")
    expect(cssText).toContain('data-sw-patched="preserve"')
    expect(cssText).toContain(`--sw-text-0: ${defaultSwatch.text0}`)
    // The host-token sheet's own :host rule forces color, not just the
    // --sw-* custom properties (bot-found, SF-AD's own review, round 5) —
    // see buildHostTokenRule's own doc comment for why an inherited (not
    // per-surface-explicit) host foreground otherwise survives unchanged
    // onto a darkened surface. Checked against the host-token sheet's own
    // :host rule specifically, not the joined cssText across every adopted
    // sheet — the static layer's own pre/th rules already contain the
    // identical substring ("color: var(--sw-text-0) !important") for an
    // unrelated reason, which would make a joined-text assertion here pass
    // whether or not :host itself actually declares it.
    const hostRule = [...root.adoptedStyleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .find((r) => r.cssText.startsWith(":host"))
    expect(hostRule).toBeDefined()
    expect(hostRule?.cssText).toContain("color: var(--sw-text-0) !important")
  })

  it("two different ShadowRoots both realizing activate-theme adopt the identical static-layer sheet object, even under different swatches", () => {
    const rootA = shadowRoot()
    const rootB = shadowRoot()
    realizeShadowColors(
      [{ kind: "activate-theme", swatchId: "default" }],
      rootA,
      defaultSwatch
    )
    realizeShadowColors(
      [{ kind: "activate-theme", swatchId: "cool-blue-gray" }],
      rootB,
      otherSwatch
    )

    // Swatch-independent — see DARK_THEME_BODY_RULES's own doc comment.
    expect(rootA.adoptedStyleSheets[0]).toBe(rootB.adoptedStyleSheets[0])
    // The host-token sheet, by contrast, IS swatch-specific.
    expect(rootA.adoptedStyleSheets[1]).not.toBe(rootB.adoptedStyleSheets[1])
  })

  it("realizes the static layer, host tokens, and a per-color sheet together for a genuine commit", () => {
    const root = shadowRoot()
    const key: SurfaceKey = "rgb(255, 255, 255)"
    realizeShadowColors(
      [
        { kind: "activate-theme", swatchId: "default" },
        { kind: "tag-surface", key, role: "surface" },
        { kind: "emit-surface-color", key, css: "rgb(10, 10, 20)" },
      ],
      root,
      defaultSwatch
    )

    expect(root.adoptedStyleSheets).toHaveLength(3)
  })
})

describe("realizeShadowColors — sheet reuse across scopes (#1268 acceptance criterion)", () => {
  it("two different ShadowRoots realizing the identical SurfaceKey/color adopt the exact same CSSStyleSheet object, not a duplicate", () => {
    const rootA = shadowRoot()
    const rootB = shadowRoot()
    const key: SurfaceKey = "rgb(255, 255, 255)"
    const actions: ReadonlyArray<FilterAction> = [
      { kind: "emit-surface-color", key, css: "rgb(10, 10, 20)" },
    ]

    realizeShadowColors(actions, rootA, null)
    realizeShadowColors(actions, rootB, null)

    const sheetA = rootA.adoptedStyleSheets[0]
    const sheetB = rootB.adoptedStyleSheets[0]
    expect(sheetA).toBeDefined()
    expect(sheetB).toBeDefined()
    // Object identity, not merely equal CSS text — the acceptance
    // criterion's own bar ("a test asserts sheet identity, not just visual
    // equivalence").
    expect(sheetA).toBe(sheetB)
  })

  it("a distinct color still gets its own, separate sheet object", () => {
    const rootA = shadowRoot()
    const rootB = shadowRoot()

    realizeShadowColors(
      [
        {
          kind: "emit-surface-color",
          key: "rgb(255, 255, 255)",
          css: "rgb(10, 10, 20)",
        },
      ],
      rootA,
      null
    )
    realizeShadowColors(
      [
        {
          kind: "emit-surface-color",
          key: "rgb(0, 0, 0)",
          css: "rgb(20, 10, 10)",
        },
      ],
      rootB,
      null
    )

    expect(rootA.adoptedStyleSheets[0]).not.toBe(rootB.adoptedStyleSheets[0])
  })
})

describe("realizeShadowColors — idempotence", () => {
  it("re-running the same actions twice leaves adoptedStyleSheets untouched (same array reference)", () => {
    const root = shadowRoot()
    const actions: ReadonlyArray<FilterAction> = [
      {
        kind: "emit-surface-color",
        key: "rgb(255, 255, 255)",
        css: "rgb(10, 10, 20)",
      },
    ]

    realizeShadowColors(actions, root, null)
    const firstArray = root.adoptedStyleSheets

    realizeShadowColors(actions, root, null)

    expect(root.adoptedStyleSheets).toBe(firstArray)
  })

  it("dropping a color removes only that sheet, leaving an unrelated already-adopted entry untouched", () => {
    const root = shadowRoot()
    const foreignSheet = new CSSStyleSheet()
    foreignSheet.insertRule("div { color: blue; }", 0)
    root.adoptedStyleSheets = [foreignSheet]

    realizeShadowColors(
      [
        {
          kind: "emit-surface-color",
          key: "rgb(255, 255, 255)",
          css: "rgb(10, 10, 20)",
        },
      ],
      root,
      null
    )
    expect(root.adoptedStyleSheets).toHaveLength(2)

    // Next round drops the color entirely.
    realizeShadowColors([], root, null)

    expect(root.adoptedStyleSheets).toHaveLength(1)
    expect(root.adoptedStyleSheets[0]).toBe(foreignSheet)
  })
})

describe("tagSurfaceElements — re-exported, works on a shadow-hosted element", () => {
  it("tags an element that lives inside a shadow root", () => {
    const root = shadowRoot()
    const div = document.createElement("div")
    root.appendChild(div)
    const key: SurfaceKey = "rgb(255, 255, 255)"

    tagSurfaceElements(
      [{ kind: "tag-surface", key, role: "surface" }],
      new Map([[key, [div]]])
    )

    expect(div.dataset.swPatched).toBe(key)
  })
})

describe("clearShadowSurfaceState", () => {
  it("removes every data-sw-patched tag inside the root and clears its adopted color sheets", () => {
    const root = shadowRoot()
    const div = document.createElement("div")
    root.appendChild(div)
    const key: SurfaceKey = "rgb(255, 255, 255)"

    tagSurfaceElements(
      [{ kind: "tag-surface", key, role: "surface" }],
      new Map([[key, [div]]])
    )
    realizeShadowColors(
      [{ kind: "emit-surface-color", key, css: "rgb(10, 10, 20)" }],
      root,
      null
    )
    expect(div.dataset.swPatched).toBe(key)
    expect(root.adoptedStyleSheets).toHaveLength(1)

    clearShadowSurfaceState(root)

    expect(div.hasAttribute("data-sw-patched")).toBe(false)
    // jsdom (this test's own environment) never initializes
    // adoptedStyleSheets to [] the way a real ShadowRoot does — see
    // shadow-actuator.ts's own header.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    expect(root.adoptedStyleSheets ?? []).toHaveLength(0)
  })

  it("leaves a foreign adopted sheet in place — only this module's own tracked sheets are cleared", () => {
    const root = shadowRoot()
    const key: SurfaceKey = "rgb(255, 255, 255)"
    realizeShadowColors(
      [{ kind: "emit-surface-color", key, css: "rgb(10, 10, 20)" }],
      root,
      null
    )
    const foreignSheet = new CSSStyleSheet()
    foreignSheet.insertRule("div { color: green; }", 0)
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, foreignSheet]

    clearShadowSurfaceState(root)

    expect(root.adoptedStyleSheets).toEqual([foreignSheet])
  })
})

describe("realizeShadowColors — vendorInvert compensates both the host tokens and per-surface colors (#1281, bot-found round 3)", () => {
  it("counter-inverts an emit-surface-color action's own background and text colors, not just the :host token rule", () => {
    const root = shadowRoot()
    const key: SurfaceKey = "rgb(255, 255, 255)"
    realizeShadowColors(
      [
        { kind: "activate-theme", swatchId: "default" },
        {
          kind: "emit-surface-color",
          key,
          css: "rgb(10, 20, 30)",
          textCss: "rgb(200, 210, 220)",
        },
      ],
      root,
      defaultSwatch,
      1
    )

    const cssText = [...root.adoptedStyleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .map((r) => r.cssText)
      .join("\n")
    // invert(1) is an exact per-channel complement (CSS Filter Effects
    // Level 1) — the same math issue-741's own e2e proofs use.
    expect(cssText).toContain("background-color: rgb(245, 235, 225)")
    expect(cssText).toContain("color: rgb(55, 45, 35)")
    expect(cssText).not.toContain("rgb(10, 20, 30)")
    expect(cssText).not.toContain("rgb(200, 210, 220)")

    // The :host token rule is compensated too, using the same swatch
    // compensateSwatch() itself would produce — proven independently here
    // rather than only by shadow-scope-theming.ts's own integration tests.
    const hostRule = [...root.adoptedStyleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .find((r) => r.cssText.startsWith(":host"))
    const compensated = compensateSwatch(defaultSwatch, 1)
    expect(hostRule?.cssText).toContain(`--sw-bg-0: ${compensated.bg0}`)
  })

  it("leaves an action with no textCss alone on that field (no spurious 'undefined' compensation)", () => {
    const root = shadowRoot()
    const key: SurfaceKey = "rgb(255, 255, 255)"
    realizeShadowColors(
      [{ kind: "emit-surface-color", key, css: "rgb(10, 20, 30)" }],
      root,
      null,
      1
    )

    const cssText = [...root.adoptedStyleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .map((r) => r.cssText)
      .join("\n")
    expect(cssText).toContain("background-color: rgb(245, 235, 225)")
    // Not just "not.toContain('color:')" — that substring also occurs
    // inside "background-color:" itself. A second, textCss-driven
    // declaration would show up as its own "; color: ..." clause.
    expect(cssText).not.toMatch(/;\s*color:/)
  })

  it("defaults to vendorInvert 0 (a no-op) when the caller has no opinion, matching pre-existing behavior", () => {
    const root = shadowRoot()
    const key: SurfaceKey = "rgb(255, 255, 255)"
    realizeShadowColors(
      [{ kind: "emit-surface-color", key, css: "rgb(10, 20, 30)" }],
      root,
      null
    )

    const cssText = [...root.adoptedStyleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .map((r) => r.cssText)
      .join("\n")
    expect(cssText).toContain("rgb(10, 20, 30)")
  })
})

describe("shadowRealizationIntact (#1280)", () => {
  it("is vacuously true for a root nothing has ever been realized into", () => {
    const root = shadowRoot()
    expect(shadowRealizationIntact(root)).toBe(true)
  })

  it("is true immediately after a realization, before anything touches adoptedStyleSheets", () => {
    const root = shadowRoot()
    realizeShadowColors(
      [{ kind: "activate-theme", swatchId: "default" }],
      root,
      defaultSwatch
    )
    expect(shadowRealizationIntact(root)).toBe(true)
  })

  it("is false once a vendor's own wholesale reassignment drops this module's sheets", () => {
    const root = shadowRoot()
    realizeShadowColors(
      [{ kind: "activate-theme", swatchId: "default" }],
      root,
      defaultSwatch
    )
    // A vendor component's own reactive-stylesheet update (Lit/FAST-style) —
    // a plain CSSOM write, not a DOM mutation.
    root.adoptedStyleSheets = []
    expect(shadowRealizationIntact(root)).toBe(false)
  })

  it("is false when only some owned sheets survive a partial reassignment", () => {
    const root = shadowRoot()
    const key: SurfaceKey = "rgb(255, 255, 255)"
    realizeShadowColors(
      [
        { kind: "activate-theme", swatchId: "default" },
        { kind: "emit-surface-color", key, css: "rgb(10, 10, 20)" },
      ],
      root,
      defaultSwatch
    )
    const surviving = root.adoptedStyleSheets[0]
    expect(surviving).toBeDefined()
    if (surviving === undefined) return
    root.adoptedStyleSheets = [surviving]
    expect(shadowRealizationIntact(root)).toBe(false)
  })

  it("is true again once realizeShadowColors re-adopts a dropped sheet", () => {
    const root = shadowRoot()
    realizeShadowColors(
      [{ kind: "activate-theme", swatchId: "default" }],
      root,
      defaultSwatch
    )
    root.adoptedStyleSheets = []
    expect(shadowRealizationIntact(root)).toBe(false)

    realizeShadowColors(
      [{ kind: "activate-theme", swatchId: "default" }],
      root,
      defaultSwatch
    )
    expect(shadowRealizationIntact(root)).toBe(true)
  })

  it("is vacuously true again once clearShadowSurfaceState empties the owned set", () => {
    const root = shadowRoot()
    realizeShadowColors(
      [{ kind: "activate-theme", swatchId: "default" }],
      root,
      defaultSwatch
    )
    clearShadowSurfaceState(root)
    expect(shadowRealizationIntact(root)).toBe(true)
  })

  it("leaves a foreign, non-extension sheet out of consideration entirely", () => {
    const root = shadowRoot()
    const foreignSheet = new CSSStyleSheet()
    foreignSheet.insertRule("div { color: blue; }", 0)
    root.adoptedStyleSheets = [foreignSheet]
    // Nothing this module owns has gone missing — a foreign sheet's own
    // presence or absence is not this function's concern.
    expect(shadowRealizationIntact(root)).toBe(true)
  })
})

describe("realizeShadowColors — bounded sheet cache (bot-found, review round 2)", () => {
  it("evicts the least-recently-used sheet once MAX_CACHED_SHEETS is exceeded", () => {
    const firstKey: SurfaceKey = "rgb(0, 0, 1)"
    const firstRoot = shadowRoot()
    realizeShadowColors(
      [{ kind: "emit-surface-color", key: firstKey, css: "rgb(1, 1, 1)" }],
      firstRoot,
      null
    )
    const firstSheet = firstRoot.adoptedStyleSheets[0]
    expect(firstSheet).toBeDefined()

    // MAX_CACHED_SHEETS more distinct colors, each on its own scope so this
    // only exercises the module-level cache's own eviction, not any single
    // root's adoption bookkeeping. Comfortably enough insertions to push
    // the very first entry (and whatever a handful of earlier tests in this
    // same file already cached) out the front, regardless of execution
    // order within the file.
    for (let i = 0; i < MAX_CACHED_SHEETS; i += 1) {
      const root = shadowRoot()
      realizeShadowColors(
        [
          {
            kind: "emit-surface-color",
            key: `rgb(0, 0, ${i + 2})`,
            css: `rgb(${i + 2}, ${i + 2}, ${i + 2})`,
          },
        ],
        root,
        null
      )
    }

    // A later realize() for the exact same first color no longer reuses the
    // original sheet object — it was evicted, so a fresh one was built.
    const laterRoot = shadowRoot()
    realizeShadowColors(
      [{ kind: "emit-surface-color", key: firstKey, css: "rgb(1, 1, 1)" }],
      laterRoot,
      null
    )
    expect(laterRoot.adoptedStyleSheets[0]).not.toBe(firstSheet)
  })
})
