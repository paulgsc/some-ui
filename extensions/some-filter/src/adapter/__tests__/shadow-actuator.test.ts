import type { FilterAction, SurfaceKey } from "@filter/adapter/contracts"
import {
  clearShadowSurfaceState,
  MAX_CACHED_SHEETS,
  realizeShadowColors,
  tagSurfaceElements,
} from "@filter/adapter/shadow-actuator"
import { SWATCHES } from "@filter/adapter/swatches"
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
