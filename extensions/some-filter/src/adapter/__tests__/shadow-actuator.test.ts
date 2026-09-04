import type { FilterAction, SurfaceKey } from "@filter/adapter/contracts"
import {
  clearShadowSurfaceState,
  realizeShadowColors,
  tagSurfaceElements,
} from "@filter/adapter/shadow-actuator"
import { afterEach, describe, expect, it } from "vitest"

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

    realizeShadowColors(actions, root)

    expect(root.adoptedStyleSheets).toHaveLength(1)
    const sheet = root.adoptedStyleSheets[0]
    expect(sheet).toBeDefined()
    if (sheet === undefined) return
    expect(sheet.cssRules).toHaveLength(1)
    expect(sheet.cssRules[0]?.cssText).toContain(`data-sw-patched="${key}"`)
    expect(sheet.cssRules[0]?.cssText).toContain("rgb(10, 10, 20)")
  })

  it("adopts nothing for an action list with no emit-surface-color members", () => {
    const root = shadowRoot()
    realizeShadowColors(
      [{ kind: "tag-surface", key: "rgb(1,2,3)", role: "surface" }],
      root
    )
    // jsdom (this test's own environment) never initializes
    // adoptedStyleSheets to [] the way a real ShadowRoot does — see
    // shadow-actuator.ts's own header.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    expect(root.adoptedStyleSheets ?? []).toHaveLength(0)
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

    realizeShadowColors(actions, rootA)
    realizeShadowColors(actions, rootB)

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
      rootA
    )
    realizeShadowColors(
      [
        {
          kind: "emit-surface-color",
          key: "rgb(0, 0, 0)",
          css: "rgb(20, 10, 10)",
        },
      ],
      rootB
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

    realizeShadowColors(actions, root)
    const firstArray = root.adoptedStyleSheets

    realizeShadowColors(actions, root)

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
      root
    )
    expect(root.adoptedStyleSheets).toHaveLength(2)

    // Next round drops the color entirely.
    realizeShadowColors([], root)

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
      root
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
      root
    )
    const foreignSheet = new CSSStyleSheet()
    foreignSheet.insertRule("div { color: green; }", 0)
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, foreignSheet]

    clearShadowSurfaceState(root)

    expect(root.adoptedStyleSheets).toEqual([foreignSheet])
  })
})
