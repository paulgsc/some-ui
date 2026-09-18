import { readFileSync } from "node:fs"
import { join } from "node:path"
import { realize } from "@filter/adapter/actuator"
import type { FilterAction, SurfaceKey } from "@filter/adapter/contracts"
import { DEFAULT_SWATCH_ID } from "@filter/adapter/swatches"
import { DARK_THEME_ATTR } from "@filter/lib/content/theme-apply"
import { afterEach, describe, expect, it } from "vitest"

const STYLE_ID = "__sw_dark_theme"
const DYNAMIC_STYLE_ID = "__sw_dark_dynamic"

function cleanUp(): void {
  document.documentElement.removeAttribute(DARK_THEME_ATTR)
  document.getElementById(STYLE_ID)?.remove()
  document.getElementById(DYNAMIC_STYLE_ID)?.remove()
  document.querySelectorAll("[data-sw-patched]").forEach((el) => {
    el.removeAttribute("data-sw-patched")
  })
  document.body.innerHTML = ""
}

describe("realize — Definition 7.3 structural check", () => {
  it("is the only adapter module referencing setAttribute/dataset/appendChild/textContent writes for the dark-theme path", () => {
    const dir = join(process.cwd(), "src/adapter")
    const stripComments = (source: string): string =>
      source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")

    // classList's write methods (add/remove/toggle/replace) count as a DOM
    // write like the rest of this pattern; .contains()/.length and friends
    // are a read no different from the getComputedStyle() calls pipeline.ts
    // is built around, so only the write methods are matched here.
    const domWritePattern =
      /\.setAttribute\(|\.removeAttribute\(|\.dataset\.|\.appendChild\(|\.textContent\s*=|\.classList\.(add|remove|toggle|replace)\(/

    const pipeline = stripComments(
      readFileSync(join(dir, "pipeline.ts"), "utf-8")
    )
    const themeAdapter = stripComments(
      readFileSync(join(dir, "theme-adapter.ts"), "utf-8")
    )
    // provisional.ts is deliberately NOT checked against this pattern: it
    // writes `data-sw-provisional` by design, which is a different
    // attribute with a different meaning (a fill standing in for an opinion
    // nobody has formed yet, never a realized verdict). The invariant this
    // test guards is about `data-sw-patched` specifically.
    const provisional = stripComments(
      readFileSync(join(dir, "provisional.ts"), "utf-8")
    )

    expect(pipeline).not.toMatch(domWritePattern)
    expect(themeAdapter).not.toMatch(domWritePattern)
    expect(provisional).not.toMatch(/\.dataset\.swPatched|data-sw-patched/)
  })
})

describe("realize — activate-theme", () => {
  it("sets DARK_THEME_ATTR and injects the static stylesheet", () => {
    realize([{ kind: "activate-theme", swatchId: "default" }], new Map())

    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(true)
    expect(document.getElementById(STYLE_ID)).not.toBeNull()

    cleanUp()
  })
})

describe("realize — tag-surface + emit-surface-color", () => {
  it("tags every element mapped to the key and emits a matching CSS rule", () => {
    const div = document.createElement("div")
    document.body.appendChild(div)
    const key: SurfaceKey = "rgb(255, 255, 255)"
    const elementsByKey = new Map([[key, [div]]])

    const actions: ReadonlyArray<FilterAction> = [
      { kind: "activate-theme", swatchId: "default" },
      { kind: "tag-surface", key, role: "surface" },
      { kind: "emit-surface-color", key, css: "rgb(10, 10, 20)" },
    ]
    realize(actions, elementsByKey)

    expect(div.dataset.swPatched).toBe(key)
    const dynamicText =
      document.getElementById(DYNAMIC_STYLE_ID)?.textContent ?? ""
    expect(dynamicText).toContain(`[data-sw-patched="${key}"]`)
    expect(dynamicText).toContain("rgb(10, 10, 20)")

    cleanUp()
  })

  it("tags every element sharing a key, not just the first", () => {
    const a = document.createElement("div")
    const b = document.createElement("div")
    document.body.append(a, b)
    const key: SurfaceKey = "rgb(255, 255, 255)"

    realize(
      [{ kind: "tag-surface", key, role: "surface" }],
      new Map([[key, [a, b]]])
    )

    expect(a.dataset.swPatched).toBe(key)
    expect(b.dataset.swPatched).toBe(key)

    cleanUp()
  })

  it("tags 'preserve'-role elements with the literal preserve value, no CSS rule", () => {
    const div = document.createElement("div")
    document.body.appendChild(div)
    const key: SurfaceKey = "rgb(13, 17, 23)"

    realize(
      [{ kind: "tag-surface", key, role: "preserve" }],
      new Map([[key, [div]]])
    )

    expect(div.dataset.swPatched).toBe("preserve")
    expect(document.getElementById(DYNAMIC_STYLE_ID)).toBeNull()

    cleanUp()
  })
})

describe("realize — idempotence (Theorem 7.2)", () => {
  it("re-running the same actions twice is a no-op on observable DOM", () => {
    const div = document.createElement("div")
    document.body.appendChild(div)
    const key: SurfaceKey = "rgb(255, 255, 255)"
    const elementsByKey = new Map([[key, [div]]])
    const actions: ReadonlyArray<FilterAction> = [
      { kind: "activate-theme", swatchId: "default" },
      { kind: "tag-surface", key, role: "surface" },
      { kind: "emit-surface-color", key, css: "rgb(10, 10, 20)" },
    ]

    realize(actions, elementsByKey)
    const afterFirst = document.head.innerHTML + document.body.innerHTML

    realize(actions, elementsByKey)
    const afterSecond = document.head.innerHTML + document.body.innerHTML

    expect(afterSecond).toBe(afterFirst)

    cleanUp()
  })

  it("re-running the same actions twice emits no mutation records at all (#831)", async () => {
    // Equal *outcome* is not enough: the Sensor reacts to mutation records,
    // not to net state. `style.textContent =` replaces the sheet's child
    // text node and `setAttribute` re-queues a record even for an identical
    // value, so a byte-identical re-realize used to look — to the observer
    // watching childList over the whole documentElement subtree — exactly
    // like the vendor changing the page, which scheduled the next round,
    // which re-realized, forever.
    const div = document.createElement("div")
    document.body.appendChild(div)
    const key: SurfaceKey = "rgb(255, 255, 255)"
    const elementsByKey = new Map([[key, [div]]])
    const actions: ReadonlyArray<FilterAction> = [
      { kind: "activate-theme", swatchId: "default" },
      { kind: "tag-surface", key, role: "surface" },
      { kind: "emit-surface-color", key, css: "rgb(10, 10, 20)" },
    ]

    realize(actions, elementsByKey)

    const records: Array<MutationRecord> = []
    const observer = new MutationObserver((batch) => records.push(...batch))
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })

    realize(actions, elementsByKey)
    await Promise.resolve()

    expect(records).toEqual([])
    observer.disconnect()

    cleanUp()
  })

  it("marks its dynamic stylesheet [data-my-ext] so the Sensor can recognise it", () => {
    const div = document.createElement("div")
    document.body.appendChild(div)
    const key: SurfaceKey = "rgb(255, 255, 255)"

    realize(
      [
        { kind: "activate-theme", swatchId: "default" },
        { kind: "tag-surface", key, role: "surface" },
        { kind: "emit-surface-color", key, css: "rgb(10, 10, 20)" },
      ],
      new Map([[key, [div]]])
    )

    expect(
      document.getElementById(DYNAMIC_STYLE_ID)?.hasAttribute("data-my-ext")
    ).toBe(true)
    expect(document.getElementById(STYLE_ID)?.hasAttribute("data-my-ext")).toBe(
      true
    )

    cleanUp()
  })
})

describe("realize — restore-native", () => {
  it("clears the dark attr, both stylesheets, and every data-sw-patched attribute", () => {
    const div = document.createElement("div")
    document.body.appendChild(div)
    const key: SurfaceKey = "rgb(255, 255, 255)"
    const elementsByKey = new Map([[key, [div]]])

    realize(
      [
        { kind: "activate-theme", swatchId: "default" },
        { kind: "tag-surface", key, role: "surface" },
        { kind: "emit-surface-color", key, css: "rgb(10, 10, 20)" },
      ],
      elementsByKey
    )

    realize([{ kind: "restore-native" }], elementsByKey)

    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(false)
    expect(document.getElementById(STYLE_ID)).toBeNull()
    expect(document.getElementById(DYNAMIC_STYLE_ID)).toBeNull()
    expect(document.querySelectorAll("[data-sw-patched]")).toHaveLength(0)

    cleanUp()
  })

  it("leaves vendor DOM byte-identical after activate + restore (#236 invariant)", () => {
    document.body.innerHTML =
      '<div id="a" style="background-color: rgb(255, 255, 255)">' +
      '<p style="background-color: rgb(200, 200, 200)">hi</p></div>'
    const before = document.body.innerHTML

    const div = document.getElementById("a")
    expect(div).not.toBeNull()
    if (div === null) return

    const key: SurfaceKey = "rgb(255, 255, 255)"
    realize(
      [
        { kind: "activate-theme", swatchId: "default" },
        { kind: "tag-surface", key, role: "surface" },
        { kind: "emit-surface-color", key, css: "rgb(10, 10, 20)" },
      ],
      new Map([[key, [div]]])
    )
    expect(document.body.innerHTML).not.toBe(before)

    realize([{ kind: "restore-native" }], new Map())

    expect(document.body.innerHTML).toBe(before)

    cleanUp()
  })
})

// ── SF-RC3 (#1342, bot-found) — realize() reports whether it actually wrote ──

describe("realize — the did-it-write signal content.ts gates its shadow re-contrast on", () => {
  afterEach(cleanUp)

  const activate: FilterAction = {
    kind: "activate-theme",
    swatchId: DEFAULT_SWATCH_ID,
  }

  function surfaceActions(key: SurfaceKey): ReadonlyArray<FilterAction> {
    return [
      activate,
      { kind: "tag-surface", key, role: "surface" },
      { kind: "emit-surface-color", key, css: "rgb(23, 23, 23)" },
    ]
  }

  it("reports a write for a NEW element under an UNCHANGED action list", () => {
    // The exact case that makes an action-list comparison the wrong gate
    // (Codex round 2 on #1412): a later element whose background matches a
    // SurfaceKey the page already has emits no new action at all, yet gets
    // tagged and darkened by the rule that already exists. A shadow
    // carrier resolving its backdrop onto it goes stale with a byte-
    // identical action list.
    const key: SurfaceKey = "rgb(255, 255, 255)"
    document.body.innerHTML = '<div id="a"></div><div id="b"></div>'
    const a = document.getElementById("a")
    const b = document.getElementById("b")
    if (a === null || b === null) throw new Error("fixture missing")

    const actions = surfaceActions(key)
    expect(realize(actions, new Map([[key, [a]]]))).toBe(true)

    // Same actions, byte for byte — only the element set grew.
    expect(
      realize(actions, new Map([[key, [a, b]]])),
      "tagging a second element is a write, however unchanged the actions are"
    ).toBe(true)
    expect(b.dataset.swPatched).toBe(key)
  })

  it("reports no write when a fully converged round re-runs unchanged", () => {
    // The other half: without this, the gate would never gate anything and
    // every document round would re-walk every committed shadow scope.
    const key: SurfaceKey = "rgb(255, 255, 255)"
    document.body.innerHTML = '<div id="a"></div>'
    const a = document.getElementById("a")
    if (a === null) throw new Error("fixture missing")

    const actions = surfaceActions(key)
    const elements = new Map([[key, [a]]])
    realize(actions, elements)

    expect(realize(actions, elements)).toBe(false)
  })

  it("reports a write when the emitted colour changes", () => {
    const key: SurfaceKey = "rgb(255, 255, 255)"
    document.body.innerHTML = '<div id="a"></div>'
    const a = document.getElementById("a")
    if (a === null) throw new Error("fixture missing")
    const elements = new Map([[key, [a]]])

    realize(surfaceActions(key), elements)
    const recolored: ReadonlyArray<FilterAction> = [
      activate,
      { kind: "tag-surface", key, role: "surface" },
      { kind: "emit-surface-color", key, css: "rgb(30, 30, 30)" },
    ]

    expect(realize(recolored, elements)).toBe(true)
  })

  it("reports a write for the restore-native teardown that actually tears something down", () => {
    const key: SurfaceKey = "rgb(255, 255, 255)"
    document.body.innerHTML = '<div id="a"></div>'
    const a = document.getElementById("a")
    if (a === null) throw new Error("fixture missing")
    realize(surfaceActions(key), new Map([[key, [a]]]))

    expect(realize([{ kind: "restore-native" }], new Map())).toBe(true)
    expect(a.hasAttribute("data-sw-patched")).toBe(false)
  })

  it("reports NO write once restore-native has converged", () => {
    // decide() emits restore-native on *every* reactive round for a
    // natively-dark document, not only when the verdict first flips — so an
    // unconditional `true` here would make every unrelated light-DOM
    // mutation on such a page re-walk every committed shadow tree, which is
    // exactly the cost this signal exists to avoid (bot-found, Codex's
    // closing review of #1412).
    const key: SurfaceKey = "rgb(255, 255, 255)"
    document.body.innerHTML = '<div id="a"></div>'
    const a = document.getElementById("a")
    if (a === null) throw new Error("fixture missing")
    realize(surfaceActions(key), new Map([[key, [a]]]))
    expect(realize([{ kind: "restore-native" }], new Map())).toBe(true)

    expect(
      realize([{ kind: "restore-native" }], new Map()),
      "the second and every later round has nothing left to tear down"
    ).toBe(false)
  })

  it("reports a write when the static theme sheet is re-created under an unchanged verdict", () => {
    // The static layer owns `html, body { background: … }`, which a shadow
    // carrier with transparent ancestors resolves its backdrop onto. A
    // vendor framework removing that sheet moves the backdrop — and with
    // `data-sw-dark` already present, nothing else in realize() would
    // report a write (bot-found, Codex's confirming review of #1412).
    const key: SurfaceKey = "rgb(255, 255, 255)"
    document.body.innerHTML = '<div id="a"></div>'
    const a = document.getElementById("a")
    if (a === null) throw new Error("fixture missing")
    const actions = surfaceActions(key)
    const elements = new Map([[key, [a]]])
    realize(actions, elements)
    expect(realize(actions, elements)).toBe(false)

    document.getElementById(STYLE_ID)?.remove()

    expect(
      realize(actions, elements),
      "re-creating the canvas sheet is a backdrop change, not a no-op"
    ).toBe(true)
    expect(document.getElementById(STYLE_ID)).not.toBeNull()
  })

  it("reports NO write for restore-native on a page that was never themed", () => {
    document.body.innerHTML = '<div id="a"></div>'
    expect(realize([{ kind: "restore-native" }], new Map())).toBe(false)
  })
})
