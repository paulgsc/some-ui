import { REPAIR_ATTR } from "@filter/adapter/foreground-repair"
import { LEGIBILITY_ATTR } from "@filter/adapter/legibility-audit"
import {
  createScopeRegistry,
  type ScopeId,
} from "@filter/adapter/scope-registry"
import {
  createShadowScopeTheming,
  SHEET_INTEGRITY_POLL_MS,
  type ShadowSceneRegistry,
  type ShadowScopeTheming,
} from "@filter/adapter/shadow-scope-theming"
import {
  DEFAULT_SWATCH_ID,
  SWATCHES,
  type Swatch,
} from "@filter/adapter/swatches"
import { parseColor, relativeLuminance } from "@filter/lib/content/color"
import type { ContrastSourceReport } from "@filter/lib/content/contrast-observability"
import { compensateSwatch } from "@filter/lib/content/theme-apply"
import { afterEach, describe, expect, it, vi } from "vitest"

const swatch = SWATCHES[DEFAULT_SWATCH_ID]

function registry(): ShadowSceneRegistry {
  return createScopeRegistry()
}

/** Registers `shadow` as a shadow scope, HELD, with a minimal (no-op) hold — mirrors what shadow-scope-discovery.ts's own registerShadowRoot does, without depending on that module. */
function registerHeld(reg: ShadowSceneRegistry, shadow: ShadowRoot): string {
  const id = `shadow:${Math.random()}`
  reg.register(id, {
    ref: shadow,
    parent: "r_0",
    contentEpoch: 0,
    hold: { install: () => {}, release: () => {} },
  })
  return id
}

function shadowRoot(): ShadowRoot {
  const host = document.createElement("div")
  document.body.appendChild(host)
  return host.attachShadow({ mode: "open" })
}

/**
 * Waits for every currently-pending microtask (however many hops deep) to
 * settle — `project()` (SF-AD's own review, round 3) now chains through a
 * per-scope serialization queue plus `resolveCommitted()`'s own internal
 * await, so a fixed count of `await Promise.resolve()` calls is fragile
 * (right today, wrong the next time either chain grows a hop). A single
 * macrotask yield is the robust alternative: the JS event loop always fully
 * drains the microtask queue — including microtasks newly scheduled by ones
 * already running — before any timer callback fires, regardless of chain
 * depth.
 */
async function flushAll(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("createShadowScopeTheming.project — ineligible ids are a no-op", () => {
  it("does nothing for an unregistered id", () => {
    const reg = registry()
    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    expect(() => theming.project("nope")).not.toThrow()
  })

  it("does nothing when the scope's ref is not a ShadowRoot (the document scope)", async () => {
    const reg = registry()
    reg.register("r_0", {
      ref: document,
      parent: null,
      contentEpoch: 0,
      hold: { install: () => {}, release: () => {} },
    })
    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project("r_0")
    await flushAll()
    expect(reg.stateOf("r_0")?.kind).toBe("HELD")
  })

  it("does nothing for a COMMITTED scope", async () => {
    const reg = registry()
    const shadow = shadowRoot()
    const id = registerHeld(reg, shadow)
    reg.startResolving(id)
    await reg.resolveCommitted(id, {
      revision: "x",
      install: () => {},
      uninstall: () => {},
    })

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
  })

  it("does nothing for a RETIRED scope", async () => {
    const reg = registry()
    const shadow = shadowRoot()
    const id = registerHeld(reg, shadow)
    reg.retire(id)

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    expect(() => theming.project(id)).not.toThrow()
    await flushAll()
    expect(reg.stateOf(id)?.kind).toBe("RETIRED")
  })
})

describe("createShadowScopeTheming.project — commits a themed shadow scope", () => {
  it("tags a hardcoded-white surface and adopts its dark color sheet, landing COMMITTED", async () => {
    const reg = registry()
    const shadow = shadowRoot()
    const surface = document.createElement("div")
    surface.setAttribute("style", "background-color: rgb(255, 255, 255)")
    shadow.appendChild(surface)
    const id = registerHeld(reg, shadow)

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    // resolveCommitted is async even for a synchronous install() — one
    // microtask hop (see scope-registry.ts's own doc comment).
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    expect(surface.dataset.swPatched).toBe("rgb(255, 255, 255)")
    // The shared static text/border/form/etc. layer, this swatch's own
    // :host token rule, and this surface's own per-color sheet — see
    // shadow-actuator.ts's own realizeShadowColors().
    expect(shadow.adoptedStyleSheets).toHaveLength(3)
  })

  it("adopts the shared static layer and host tokens even for a scope with no evidenced surfaces (mirrors decide()'s own unconditional activate-theme)", async () => {
    const reg = registry()
    const shadow = shadowRoot()
    const id = registerHeld(reg, shadow)

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    expect(shadow.adoptedStyleSheets).toHaveLength(2)
  })

  it("two scopes committing under the same swatch adopt the exact same static-layer CSSStyleSheet object", async () => {
    const reg = registry()
    const shadowA = shadowRoot()
    const shadowB = shadowRoot()
    const idA = registerHeld(reg, shadowA)
    const idB = registerHeld(reg, shadowB)

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(idA)
    theming.project(idB)
    await flushAll()

    expect(reg.stateOf(idA)?.kind).toBe("COMMITTED")
    expect(reg.stateOf(idB)?.kind).toBe("COMMITTED")
    expect(shadowA.adoptedStyleSheets[0]).toBe(shadowB.adoptedStyleSheets[0])
  })

  it("themes a scope nested two levels deep, independent of its ancestor's own commit", async () => {
    const reg = registry()
    const outer = shadowRoot()
    const innerHost = document.createElement("div")
    outer.appendChild(innerHost)
    const inner = innerHost.attachShadow({ mode: "open" })
    const surface = document.createElement("div")
    surface.setAttribute("style", "background-color: rgb(255, 255, 255)")
    inner.appendChild(surface)

    const outerId = registerHeld(reg, outer)
    const innerId = `shadow:inner`
    reg.register(innerId, {
      ref: inner,
      parent: outerId,
      contentEpoch: 0,
      hold: { install: () => {}, release: () => {} },
    })

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(outerId)
    theming.project(innerId)
    await flushAll()

    expect(reg.stateOf(outerId)?.kind).toBe("COMMITTED")
    expect(reg.stateOf(innerId)?.kind).toBe("COMMITTED")
    expect(surface.dataset.swPatched).toBe("rgb(255, 255, 255)")
    expect(inner.adoptedStyleSheets).toHaveLength(3)
  })
})

describe("createShadowScopeTheming.project — exoneration", () => {
  it("exonerates with 'no-swatch' when swatch is null, clearing a prior commit's own tags/colors first", async () => {
    const reg = registry()
    const shadow = shadowRoot()
    const surface = document.createElement("div")
    surface.setAttribute("style", "background-color: rgb(255, 255, 255)")
    shadow.appendChild(surface)
    const id = registerHeld(reg, shadow)

    const themedTheming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    themedTheming.project(id)
    await flushAll()
    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    expect(surface.dataset.swPatched).toBe("rgb(255, 255, 255)")

    reg.invalidate(id)
    const nullTheming = createShadowScopeTheming(
      reg,
      () => null,
      () => 0
    )
    nullTheming.project(id)
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("EXONERATED_NATIVE")
    expect(surface.hasAttribute("data-sw-patched")).toBe(false)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    expect(shadow.adoptedStyleSheets ?? []).toHaveLength(0)
  })

  it("exonerates with 'restore-native' when the scope's own content already reads dark, clearing a prior commit's own tags/colors", async () => {
    const reg = registry()
    const shadow = shadowRoot()
    // >= MIN_EVIDENCE_FOR_DARK_VERDICT (3) distinct dark keys, all rendered
    // and opaque — the same bar theme-adapter.ts's pageAlreadyDark() checks.
    const darkColors = ["rgb(5, 5, 5)", "rgb(6, 6, 6)", "rgb(7, 7, 7)"]
    for (const color of darkColors) {
      const el = document.createElement("div")
      el.setAttribute("style", `background-color: ${color}`)
      shadow.appendChild(el)
    }
    const staleSurface = document.createElement("div")
    shadow.appendChild(staleSurface)
    staleSurface.dataset.swPatched = "rgb(255, 255, 255)"

    const id = registerHeld(reg, shadow)
    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("EXONERATED_NATIVE")
    expect(staleSurface.hasAttribute("data-sw-patched")).toBe(false)
  })
})

describe("createShadowScopeTheming.project — a thrown scan/decide resolves FAILED_HELD, not an uncaught throw", () => {
  it("catches a scan() failure and transitions to FAILED_HELD", async () => {
    const reg = registry()
    const shadow = shadowRoot()
    const id = registerHeld(reg, shadow)

    const spy = vi
      .spyOn(document, "createTreeWalker")
      .mockImplementation(() => {
        throw new Error("boom")
      })
    try {
      const theming = createShadowScopeTheming(
        reg,
        () => swatch,
        () => 0
      )
      expect(() => theming.project(id)).not.toThrow()
      await flushAll()
    } finally {
      spy.mockRestore()
    }

    const state = reg.stateOf(id)
    expect(state?.kind).toBe("FAILED_HELD")
    if (state?.kind === "FAILED_HELD") {
      expect(state.reason).toBe("boom")
    }
  })
})

describe("createShadowScopeTheming.project — FAILED_HELD retries", () => {
  it("retries a FAILED_HELD scope back toward RESOLVING and can commit on the next call", async () => {
    const reg = registry()
    const shadow = shadowRoot()
    const surface = document.createElement("div")
    surface.setAttribute("style", "background-color: rgb(255, 255, 255)")
    shadow.appendChild(surface)
    const id = registerHeld(reg, shadow)

    const spy = vi
      .spyOn(document, "createTreeWalker")
      .mockImplementation(() => {
        throw new Error("boom")
      })
    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    await flushAll()
    spy.mockRestore()
    expect(reg.stateOf(id)?.kind).toBe("FAILED_HELD")

    theming.project(id)
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
  })
})

describe("createShadowScopeTheming.project — serializes overlapping calls (bot-found, review round 3)", () => {
  it("two overlapping project() calls for the same id never let the second clobber the first's successful commit", async () => {
    // Simulates shadow-scope-discovery.ts's own host and per-root observers
    // both firing project(id) for one underlying vendor change that touches
    // a host's class *and* mutates content inside its shadow root in the
    // same synchronous turn — before this fix, the second call's own
    // resolveCommitted() would resume with a stale generation, take
    // scope-registry.ts's own "stale completion" branch, and call *its*
    // uninstall() (clearShadowSurfaceState()), stripping the tags/sheets the
    // first call had just successfully installed, while the registry itself
    // stayed COMMITTED with its hold released — visibly unthemed, but
    // reporting healthy.
    const reg = registry()
    const shadow = shadowRoot()
    const surface = document.createElement("div")
    surface.setAttribute("style", "background-color: rgb(255, 255, 255)")
    shadow.appendChild(surface)
    const id = registerHeld(reg, shadow)

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    theming.project(id)
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    expect(surface.dataset.swPatched).toBe("rgb(255, 255, 255)")
    expect(shadow.adoptedStyleSheets.length).toBeGreaterThan(0)
  })

  it("three overlapping calls settle the same way as one", async () => {
    const reg = registry()
    const shadow = shadowRoot()
    const surface = document.createElement("div")
    surface.setAttribute("style", "background-color: rgb(255, 255, 255)")
    shadow.appendChild(surface)
    const id = registerHeld(reg, shadow)

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    theming.project(id)
    theming.project(id)
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    expect(surface.dataset.swPatched).toBe("rgb(255, 255, 255)")
    expect(shadow.adoptedStyleSheets.length).toBeGreaterThan(0)
  })
})

describe("createShadowScopeTheming.project — forces a fresh round for a trigger that arrives after the scan but before commit settles (bot-found, review round 4)", () => {
  it("a second project() call queued while the first is still in flight re-engages the hold for its own round, even though the first already committed by the time the second's turn comes", async () => {
    // Mirrors shadow-scope-discovery.ts's own per-root observer calling
    // project(id) again for a mutation that lands after the first round's
    // own scan() already ran but before resolveCommitted()'s install()
    // await has settled — real evidence no scan has seen yet. Without
    // forceInvalidate, project()'s serialization queue (round 3's own fix)
    // means this second call's projectOnce() does not even start until the
    // first has fully committed, at which point ensureResolving() reads
    // COMMITTED and silently no-ops, permanently leaving the new content
    // unclassified with the hold already released.
    //
    // register()'s hold.install() fires once, synchronously, before either
    // project() call is ever made — a hold-install spy is therefore a
    // deterministic proxy for "did a round force scope-registry.ts's own
    // invalidate() (the only other caller of hold.install(), per that
    // module's own doc comment) before its turn came," without needing to
    // land a call exactly inside the narrow mid-scan window itself.
    const reg = registry()
    const shadow = shadowRoot()
    const surface = document.createElement("div")
    surface.setAttribute("style", "background-color: rgb(255, 255, 255)")
    shadow.appendChild(surface)

    const install = vi.fn()
    const release = vi.fn()
    const id = `shadow:${Math.random()}`
    reg.register(id, {
      ref: shadow,
      parent: "r_0",
      contentEpoch: 0,
      hold: { install, release },
    })

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    theming.project(id)
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    expect(install.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})

describe("createShadowScopeTheming.project — cross-realm ShadowRoot (bot-found, review round 3)", () => {
  it("projects a shadow root whose host was created in a different realm and adopted into this document", async () => {
    const iframe = document.createElement("iframe")
    document.body.appendChild(iframe)
    const foreignDoc = iframe.contentDocument
    expect(foreignDoc).not.toBeNull()
    if (foreignDoc === null) return

    // Created in the iframe's own realm, then adopted into the top
    // document — appendChild() across documents adopts implicitly, the
    // same as a real page moving DOM across a same-origin iframe boundary.
    const foreignHost = foreignDoc.createElement("div")
    document.body.appendChild(foreignHost)
    const foreignShadow = foreignHost.attachShadow({ mode: "open" })
    expect(foreignShadow instanceof ShadowRoot).toBe(false)
    const surface = foreignDoc.createElement("div")
    surface.setAttribute("style", "background-color: rgb(255, 255, 255)")
    foreignShadow.appendChild(surface)

    const reg = registry()
    const id = registerHeld(reg, foreignShadow)
    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")

    iframe.remove()
  })
})

describe("createShadowScopeTheming.project — vendor-invert compensation for the host-token rule (#1281)", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("filter")
  })

  it("builds the :host token rule from the compensated swatch, not the raw one, when a vendor invert is active", async () => {
    document.documentElement.style.filter = "invert(1)"
    const reg = registry()
    const shadow = shadowRoot()
    const id = registerHeld(reg, shadow)

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    const hostRule = [...shadow.adoptedStyleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .find((r) => r.cssText.startsWith(":host"))
    expect(hostRule).toBeDefined()

    const compensated = compensateSwatch(swatch, 1)
    expect(hostRule?.cssText).toContain(`--sw-bg-0: ${compensated.bg0}`)
    // Guards against a vacuous pass: the raw, uncompensated token must not
    // be what actually got adopted.
    expect(hostRule?.cssText).not.toContain(`--sw-bg-0: ${swatch.bg0}`)
  })

  it("compensates a classified surface's own emit-surface-color background too, not just the :host token rule (bot-found, round 3)", async () => {
    document.documentElement.style.filter = "invert(1)"
    const reg = registry()
    const shadow = shadowRoot()
    const surface = document.createElement("div")
    surface.setAttribute("style", "background-color: rgb(255, 255, 255)")
    shadow.appendChild(surface)
    const id = registerHeld(reg, shadow)

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    expect(surface.dataset.swPatched).toBe("rgb(255, 255, 255)")
    const surfaceRule = [...shadow.adoptedStyleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .find((r) => r.cssText.includes('data-sw-patched="rgb(255, 255, 255)"'))
    expect(surfaceRule).toBeDefined()
    // Whatever dark background decide()/theme-adapter.ts chose for this
    // surface, it must not survive into the adopted sheet unmodified — an
    // earlier version of this fix compensated only the :host token rule,
    // leaving this declaration exactly as decide() produced it, composited
    // straight through the page's own filter: invert(1) into a bright
    // background under (now-correctly-compensated, light-reading) text.
    const declaredBackground = surfaceRule?.cssText.match(
      /background-color:\s*([^;!]+)/
    )?.[1]
    expect(declaredBackground).toBeDefined()
    if (declaredBackground === undefined) throw new Error("unreachable")
    const rgba = parseColor(declaredBackground.trim())
    expect(rgba).not.toBeNull()
    if (rgba === null) throw new Error("unreachable")
    // The declared value, composited through the page's own invert(1),
    // must still read dark — the same "asSeen" check this codebase's own
    // e2e specs use for #741.
    const asSeenLuminance = relativeLuminance(
      1 - rgba[0],
      1 - rgba[1],
      1 - rgba[2]
    )
    expect(asSeenLuminance).toBeLessThan(0.3)
  })

  it("recomputes the compensation every round rather than caching it at construction — a scope re-committing after the vendor invert toggles off adopts the raw swatch again", async () => {
    document.documentElement.style.filter = "invert(1)"
    const reg = registry()
    const shadow = shadowRoot()
    const id = registerHeld(reg, shadow)

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    await flushAll()
    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")

    document.documentElement.style.removeProperty("filter")
    reg.invalidate(id)
    theming.project(id)
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    const hostRule = [...shadow.adoptedStyleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .find((r) => r.cssText.startsWith(":host"))
    expect(hostRule?.cssText).toContain(`--sw-bg-0: ${swatch.bg0}`)
  })

  it("decide()'s own classification still runs against the raw swatch — the committed revision id is unaffected by compensation", async () => {
    document.documentElement.style.filter = "invert(1)"
    const reg = registry()
    const shadow = shadowRoot()
    const id = registerHeld(reg, shadow)

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    await flushAll()

    const state = reg.stateOf(id)
    expect(state?.kind).toBe("COMMITTED")
    if (state?.kind === "COMMITTED") {
      expect(state.revision).toBe(swatch.id)
    }
  })
})

describe("createShadowScopeTheming.observe/teardown — sheet-integrity poll (#1280)", () => {
  it("repairs a COMMITTED scope's realization after a vendor's own wholesale adoptedStyleSheets reassignment", async () => {
    const reg = registry()
    const shadow = shadowRoot()
    const surface = document.createElement("div")
    surface.setAttribute("style", "background-color: rgb(255, 255, 255)")
    shadow.appendChild(surface)
    const id = registerHeld(reg, shadow)

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    await flushAll()
    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    const before = shadow.adoptedStyleSheets.length
    expect(before).toBeGreaterThan(0)
    expect(surface.dataset.swPatched).toBe("rgb(255, 255, 255)")

    // A vendor component's own wholesale reassignment — a plain CSSOM write
    // no MutationObserver anywhere can see — silently drops every sheet this
    // module adopted, with no other mutation to react to.
    shadow.adoptedStyleSheets = []

    vi.useFakeTimers()
    try {
      theming.observe()
      await vi.advanceTimersByTimeAsync(SHEET_INTEGRITY_POLL_MS)
    } finally {
      vi.useRealTimers()
    }
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    expect(shadow.adoptedStyleSheets.length).toBe(before)
    // The reconciliation is a full re-project, not merely re-adopting old
    // sheet objects — the surface's own tag survives it too.
    expect(surface.dataset.swPatched).toBe("rgb(255, 255, 255)")
  })

  it("teardown() stops the poll — a reassignment after teardown is never repaired", async () => {
    const reg = registry()
    const shadow = shadowRoot()
    const surface = document.createElement("div")
    surface.setAttribute("style", "background-color: rgb(255, 255, 255)")
    shadow.appendChild(surface)
    const id = registerHeld(reg, shadow)

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    await flushAll()
    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")

    shadow.adoptedStyleSheets = []

    vi.useFakeTimers()
    try {
      theming.observe()
      theming.teardown()
      await vi.advanceTimersByTimeAsync(SHEET_INTEGRITY_POLL_MS * 2)
    } finally {
      vi.useRealTimers()
    }
    await flushAll()

    // Still COMMITTED (nothing invalidated it), but its sheets were never
    // reinstalled — the poll never fired.
    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    expect(shadow.adoptedStyleSheets ?? []).toHaveLength(0)
  })

  it("leaves a HELD (never-committed) scope alone — nothing to reconcile", async () => {
    const reg = registry()
    const shadow = shadowRoot()
    const id = registerHeld(reg, shadow)

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )

    vi.useFakeTimers()
    try {
      theming.observe()
      await vi.advanceTimersByTimeAsync(SHEET_INTEGRITY_POLL_MS)
    } finally {
      vi.useRealTimers()
    }
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("HELD")
  })

  it("observe() is idempotent — calling it twice does not double the poll", async () => {
    const reg = registry()
    const shadow = shadowRoot()
    const surface = document.createElement("div")
    surface.setAttribute("style", "background-color: rgb(255, 255, 255)")
    shadow.appendChild(surface)
    const id = registerHeld(reg, shadow)

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    await flushAll()
    const before = shadow.adoptedStyleSheets.length

    vi.useFakeTimers()
    try {
      theming.observe()
      theming.observe()
      shadow.adoptedStyleSheets = []
      await vi.advanceTimersByTimeAsync(SHEET_INTEGRITY_POLL_MS)
    } finally {
      vi.useRealTimers()
    }
    await flushAll()

    expect(shadow.adoptedStyleSheets.length).toBe(before)
  })
})

describe("createShadowScopeTheming.observe/teardown — reprojects on a vendor-invert change with nothing else to react to (bot-found, PR review round 1)", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("filter")
  })

  it("rebuilds a COMMITTED scope's :host token rule once the page's own vendor invert changes after commit, with no sheet ever missing and no other mutation", async () => {
    const reg = registry()
    const shadow = shadowRoot()
    const id = registerHeld(reg, shadow)

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    await flushAll()
    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    // Committed with no vendor invert active — the raw, uncompensated
    // swatch is correct at this point.
    const hostRuleBefore = [...shadow.adoptedStyleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .find((r) => r.cssText.startsWith(":host"))
    expect(hostRuleBefore?.cssText).toContain(`--sw-bg-0: ${swatch.bg0}`)

    // The page turns its own vendor invert on *after* this scope already
    // committed — a real accessibility-toggle pattern (#741), and one that
    // touches neither this scope's own subtree nor its host's class/style,
    // so nothing reactive here would ever see it on its own. Every sheet
    // this module adopted is still exactly where it was — shadowRealizationIntact
    // alone would find nothing wrong.
    document.documentElement.style.filter = "invert(1)"

    vi.useFakeTimers()
    try {
      theming.observe()
      await vi.advanceTimersByTimeAsync(SHEET_INTEGRITY_POLL_MS)
    } finally {
      vi.useRealTimers()
    }
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    const hostRuleAfter = [...shadow.adoptedStyleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .find((r) => r.cssText.startsWith(":host"))
    const compensated = compensateSwatch(swatch, 1)
    expect(hostRuleAfter?.cssText).toContain(`--sw-bg-0: ${compensated.bg0}`)
    expect(hostRuleAfter?.cssText).not.toContain(`--sw-bg-0: ${swatch.bg0}`)
  })

  it("reprojects a scope whose own committed invert amount has gone stale even when the poll's own sampled value nets to no change across ticks (bot-found, PR review round 2)", async () => {
    const reg = registry()
    const shadow = shadowRoot()
    const id = registerHeld(reg, shadow)

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    await flushAll()
    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")

    // Some *other* event (a genuine vendor mutation invalidating and
    // recommitting this same scope, in the real pipeline) recommits this
    // scope while the vendor's own invert is transiently active — never
    // observed by this poll directly, the same way it would happen for
    // real between two of the poll's own ticks.
    document.documentElement.style.filter = "invert(1)"
    reg.invalidate(id)
    theming.project(id)
    await flushAll()
    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    const hostRuleMidway = [...shadow.adoptedStyleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .find((r) => r.cssText.startsWith(":host"))
    const compensated = compensateSwatch(swatch, 1)
    expect(hostRuleMidway?.cssText).toContain(`--sw-bg-0: ${compensated.bg0}`)

    // The vendor invert reverts before the poll's own next tick. A global
    // "changed since my own last sample" comparison would see the *same*
    // value (0) it saw before this whole sequence began and conclude
    // nothing needs fixing — even though this scope's own realization was
    // actually built for 1, not 0.
    document.documentElement.style.removeProperty("filter")

    vi.useFakeTimers()
    try {
      theming.observe()
      await vi.advanceTimersByTimeAsync(SHEET_INTEGRITY_POLL_MS)
    } finally {
      vi.useRealTimers()
    }
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    const hostRuleAfter = [...shadow.adoptedStyleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .find((r) => r.cssText.startsWith(":host"))
    expect(hostRuleAfter?.cssText).toContain(`--sw-bg-0: ${swatch.bg0}`)
    expect(hostRuleAfter?.cssText).not.toContain(
      `--sw-bg-0: ${compensated.bg0}`
    )
  })

  it("a scope committed while a vendor invert is already active is left alone across later ticks if nothing changes", async () => {
    document.documentElement.style.filter = "invert(1)"
    const reg = registry()
    const shadow = shadowRoot()
    const id = registerHeld(reg, shadow)

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    await flushAll()
    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    // realizeShadowColors's own idempotence discipline means the adopted
    // array's own reference only ever changes when a real
    // invalidate()+recommit cycle actually runs — the most direct
    // discriminator for "was this scope touched again," independent of
    // whether the recomputed content would happen to look the same.
    const sheetsAfterCommit = shadow.adoptedStyleSheets

    vi.useFakeTimers()
    try {
      theming.observe()
      // First tick after commit: establishes this poll's own baseline
      // observation of the (unchanged, already-active) invert amount — must
      // not itself be treated as a change.
      await vi.advanceTimersByTimeAsync(SHEET_INTEGRITY_POLL_MS)
      // Second tick: a real baseline now exists, and nothing changed since.
      await vi.advanceTimersByTimeAsync(SHEET_INTEGRITY_POLL_MS)
    } finally {
      vi.useRealTimers()
    }
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    expect(shadow.adoptedStyleSheets).toBe(sheetsAfterCommit)
  })
})

// ── SF-RC3 (#1342) — the rendered-contrast channel, per scope ──

describe("createShadowScopeTheming.project — rendered-contrast channel (#1342)", () => {
  /**
   * A light surface (so the scope themes at all rather than reading as
   * already-dark) containing a dark panel whose own carrier declares black
   * text against it — the authored, pre-actuation violation SF-RC2's own
   * witness B has, reproduced inside a shadow scope.
   *
   * Authored rather than actuation-induced on purpose: jsdom applies
   * neither `adoptedStyleSheets` nor a `<style>` rule to `getComputedStyle`,
   * so a violation that only exists *after* this module's own sheets land
   * is invisible in this environment by construction. What this test is for
   * is the wiring — that the scoped audit runs at all, that its two realize
   * halves reach the right root, and that the repair's rule lands in *this
   * scope's* adoptedStyleSheets — not the cascade, which is an e2e claim
   * (`issue-1342-sfrc3-shadow-foreground.spec.ts`) against real Chromium.
   */
  function violatedScope(): { shadow: ShadowRoot; carrier: HTMLElement } {
    const shadow = shadowRoot()
    const surface = document.createElement("div")
    surface.setAttribute("style", "background-color: rgb(255, 255, 255)")
    const panel = document.createElement("div")
    panel.setAttribute("style", "background-color: rgb(20, 20, 20)")
    const carrier = document.createElement("div")
    carrier.setAttribute("style", "color: rgb(0, 0, 0)")
    carrier.textContent = "illegible"
    panel.appendChild(carrier)
    surface.appendChild(panel)
    shadow.appendChild(surface)
    return { shadow, carrier }
  }

  it("tags a violated carrier and adopts its repair rule into that scope's own sheets", async () => {
    const reg = registry()
    const { shadow, carrier } = violatedScope()
    const id = registerHeld(reg, shadow)

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    expect(carrier.getAttribute(LEGIBILITY_ATTR)).toBe("violated")
    const key = carrier.getAttribute(REPAIR_ATTR)
    expect(key).toBe("rgb(0, 0, 0)~rgb(20, 20, 20)")

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- see shadow-actuator.ts's header.
    const sheets = shadow.adoptedStyleSheets ?? []
    const repairRule = sheets
      .flatMap((sheet) => [...sheet.cssRules])
      .find((rule) => rule.cssText.includes(REPAIR_ATTR))
    expect(repairRule, "no repair rule adopted into the scope").toBeDefined()
    expect(repairRule?.cssText).toContain(`${REPAIR_ATTR}="${key ?? ""}"`)
  })

  it("reports this scope's own violated pair through onContrastAudited, keyed by its scope id — SF-RC5 (#1344), bot-found (Codex review round 1 on #1443): the document's own contrast snapshot cannot see a shadow-only violation at all, since auditLegibility's TreeWalker does not cross a shadow boundary", async () => {
    const reg = registry()
    const { shadow } = violatedScope()
    const id = registerHeld(reg, shadow)
    let reportedId: ScopeId | undefined
    let reportedAudit: ContrastSourceReport | undefined
    const onContrastAudited = vi.fn(
      (auditedId: ScopeId, audit: ContrastSourceReport) => {
        reportedId = auditedId
        reportedAudit = audit
      }
    )

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0,
      onContrastAudited
    )
    theming.project(id)
    await flushAll()

    expect(onContrastAudited).toHaveBeenCalled()
    expect(reportedId).toBe(id)
    expect(reportedAudit?.length).toBeGreaterThanOrEqual(1)
    expect(reportedAudit?.some((r) => r.verdict === "violated")).toBe(true)
  })

  it("keeps the repair sheet alongside — not instead of — the scope's static layer, host tokens and surface colours", async () => {
    // One desired sheet set per root is what keeps shadowRealizationIntact
    // (#1280) and clearShadowSurfaceState covering everything this extension
    // put here — see realizeShadowColors's own `repairs` parameter.
    const reg = registry()
    const { shadow } = violatedScope()
    const id = registerHeld(reg, shadow)

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    await flushAll()

    // static layer + :host tokens + the white surface's own colour + repair.
    expect(shadow.adoptedStyleSheets).toHaveLength(4)
  })

  it("re-projecting an unchanged scope converges on the identical tag and sheet set (no oscillation)", async () => {
    // Theorem 7.2's fixed point, one scope over: the same authored evidence
    // must re-derive the same violation every round. A round that instead
    // read back its *own* repair would call the carrier legible and drop the
    // tag — SF-RC2's own oscillation, which withScopeTransitionsFrozen and
    // the teardown-before-install ordering are what prevent here.
    const reg = registry()
    const { shadow, carrier } = violatedScope()
    const id = registerHeld(reg, shadow)

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    await flushAll()
    const firstKey = carrier.getAttribute(REPAIR_ATTR)
    const firstSheets = [...shadow.adoptedStyleSheets]

    reg.invalidate(id)
    theming.project(id)
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    expect(carrier.getAttribute(REPAIR_ATTR)).toBe(firstKey)
    expect([...shadow.adoptedStyleSheets]).toEqual(firstSheets)
  })

  it("leaves no freeze sheet of its own adopted once a round settles", async () => {
    // The scope freeze is a read-time artifact, not part of the realization:
    // anything left behind would be a sheet ownedSheetsByRoot does not track
    // and clearShadowSurfaceState therefore never clears.
    const reg = registry()
    const { shadow } = violatedScope()
    const id = registerHeld(reg, shadow)

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project(id)
    await flushAll()

    // Identified by the freeze rule's own selector, not by the substring
    // "transition: none": the static shadow layer now carries that
    // declaration too (provisional.ts's fill must not animate in through a
    // vendor transition), so the looser match reports the permanent,
    // correctly-adopted static layer as a leak. `data-sw-legibility-fix`
    // appears in FREEZE_RULE and nowhere else.
    const frozen = shadow.adoptedStyleSheets.filter((sheet) =>
      [...sheet.cssRules].some(
        (rule) =>
          rule.cssText.includes("transition: none") &&
          rule.cssText.includes("data-sw-legibility-fix")
      )
    )
    expect(frozen).toHaveLength(0)
  })
})

describe("createShadowScopeTheming.project — an ancestor commit re-audits nested scopes (#1342, bot-found)", () => {
  /**
   * `shadow-scope-discovery.ts`'s `registerShadowRoot` recurses into nested
   * roots before calling `onScopeReady` for the parent, so a child's audit
   * can score an ancestor backdrop that is about to be darkened — and
   * nothing re-audits it afterwards, since an ancestor's realization is
   * `adoptedStyleSheets` writes plus attribute writes inside the *ancestor's*
   * root, neither of which any observer watching the child can see.
   *
   * This environment cannot express that claim directly, for two independent
   * reasons: jsdom applies no stylesheet to `getComputedStyle`, so the
   * ancestor's own darkening never lands; and jsdom caches an element's
   * computed style permanently after the first read (confirmed directly — a
   * later `setAttribute("style", …)` updates the attribute but not
   * `getComputedStyle`), so a stand-in inline change to an
   * already-audited backdrop is invisible too.
   *
   * What these tests pin instead is the *mechanism*, isolated: no observer
   * is wired here, so a nested scope's carrier can only be tagged if
   * committing its ancestor re-ran that scope's contrast half. The
   * end-to-end claim — a carrier whose backdrop actually resolves through
   * its host into the outer scope and is repaired only once the outer scope
   * themes — is `issue-1342-sfrc3-shadow-foreground.spec.ts`'s own
   * nested-crosser case, against real Chromium.
   */
  function nestedScopes(): {
    outer: ShadowRoot
    inner: ShadowRoot
  } {
    const outer = shadowRoot()
    const outerSurface = document.createElement("div")
    outerSurface.setAttribute("style", "background-color: rgb(255, 255, 255)")
    const innerHost = document.createElement("div")
    outerSurface.appendChild(innerHost)
    outer.appendChild(outerSurface)
    return { outer, inner: innerHost.attachShadow({ mode: "open" }) }
  }

  /** A dark panel carrying black text — violated on its own evidence, so the audit's verdict does not depend on any stylesheet landing. */
  function addViolatedCarrier(root: ShadowRoot): HTMLElement {
    const panel = document.createElement("div")
    panel.setAttribute("style", "background-color: rgb(20, 20, 20)")
    const carrier = document.createElement("div")
    carrier.setAttribute("style", "color: rgb(0, 0, 0)")
    carrier.textContent = "crosser"
    panel.appendChild(carrier)
    root.appendChild(panel)
    return carrier
  }

  it("re-runs a nested scope's contrast half when its ancestor commits, without invalidating it", async () => {
    const reg = registry()
    const { outer, inner } = nestedScopes()
    const outerId = registerHeld(reg, outer)
    const innerId = "shadow:inner-crosser"
    reg.register(innerId, {
      ref: inner,
      parent: outerId,
      contentEpoch: 0,
      hold: { install: () => {}, release: () => {} },
    })

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )

    // The child projects first, exactly as discovery orders it — with
    // nothing yet to find.
    theming.project(innerId)
    await flushAll()
    expect(reg.stateOf(innerId)?.kind).toBe("COMMITTED")

    // Stands in for evidence the child's own audit could not have seen when
    // it ran. Nothing observes this root, so only an ancestor-driven
    // re-audit can pick it up.
    const carrier = addViolatedCarrier(inner)

    theming.project(outerId)
    await flushAll()

    expect(reg.stateOf(outerId)?.kind).toBe("COMMITTED")
    expect(
      carrier.getAttribute(REPAIR_ATTR),
      "committing the ancestor must re-audit the nested scope"
    ).toBe("rgb(0, 0, 0)~rgb(20, 20, 20)")
    expect(
      carrier.getAttribute(LEGIBILITY_ATTR),
      "the diagnostic half must be re-run too, not just the repair"
    ).toBe("violated")
    expect(
      reg.stateOf(innerId)?.kind,
      "re-contrast must not re-engage the nested scope's occlusion hold"
    ).toBe("COMMITTED")
  })

  it("reports null for a descendant whose own re-contrast throws, rather than leaving its prior audit standing (bot-found, Codex confirming review on #1443)", async () => {
    // The descendant itself never transitions on this failure — it stays
    // COMMITTED (recontrastScopes's own doc comment: "this runs after
    // resolveCommitted has already resolved, so a throw here cannot be
    // reported as a FAILED_HELD") — so none of content.ts's
    // eviction-on-transition switch cases fire either. Without
    // onContrastAudited reporting `null` from the catch itself, the
    // descendant's last-good audit from before whatever repaint this
    // re-contrast was reacting to would stand in as current forever — and
    // reporting `[]` instead of `null` would only trade that bug for a
    // subtler one (bot-found, Codex confirming review round 3 on #1443): a
    // failed scope would then merge indistinguishably from a scope that
    // genuinely audited nothing this round.
    const reg = registry()
    const { outer, inner } = nestedScopes()
    const outerId = registerHeld(reg, outer)
    const innerId = "shadow:inner-throws-on-recontrast"
    reg.register(innerId, {
      ref: inner,
      parent: outerId,
      contentEpoch: 0,
      hold: { install: () => {}, release: () => {} },
    })
    const carrier = addViolatedCarrier(inner)

    const reportedAudits: Array<{ id: ScopeId; audit: ContrastSourceReport }> =
      []
    const onContrastAudited = vi.fn(
      (id: ScopeId, audit: ContrastSourceReport) => {
        reportedAudits.push({ id, audit })
      }
    )
    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0,
      onContrastAudited
    )

    theming.project(innerId)
    await flushAll()
    expect(reg.stateOf(innerId)?.kind).toBe("COMMITTED")
    const innerCommitAudit = reportedAudits[reportedAudits.length - 1]
    expect(innerCommitAudit?.id).toBe(innerId)
    expect(
      innerCommitAudit?.audit?.some((r) => r.verdict === "violated"),
      "the scope's own initial commit must report the real violation"
    ).toBe(true)

    // The spy is installed only now, after inner's own initial commit above
    // has already run for real — so the next (and only) call it sees for
    // `inner` is the ancestor-triggered re-contrast, which this makes fail.
    const originalCreateTreeWalker = document.createTreeWalker.bind(document)
    const spy = vi
      .spyOn(document, "createTreeWalker")
      .mockImplementation((root, whatToShow, filter) => {
        if (root === inner) {
          throw new Error("re-contrast boom")
        }
        return originalCreateTreeWalker(root, whatToShow, filter)
      })
    try {
      theming.project(outerId)
      await flushAll()
    } finally {
      spy.mockRestore()
    }

    expect(reg.stateOf(outerId)?.kind).toBe("COMMITTED")
    expect(
      reg.stateOf(innerId)?.kind,
      "a failed re-contrast must not itself move the descendant's own registry state"
    ).toBe("COMMITTED")
    // realizeLegibility never re-ran on the failed pass (the throw happens
    // inside auditLegibility, before it) — the tag stands as the initial
    // commit left it.
    expect(carrier.getAttribute(LEGIBILITY_ATTR)).toBe("violated")

    const reportsForInner = reportedAudits.filter((r) => r.id === innerId)
    const lastReportForInner = reportsForInner[reportsForInner.length - 1]
    expect(
      lastReportForInner?.audit,
      "the failed re-contrast must report null, not leave the prior violated one standing"
    ).toBeNull()
  })

  it("re-audits a scope nested two levels down, not just a direct child", async () => {
    // A grandchild's backdrop can resolve through two hosts to this
    // ancestor just as easily as one, so the walk is transitive.
    const reg = registry()
    const { outer, inner } = nestedScopes()
    const grandHost = document.createElement("div")
    inner.appendChild(grandHost)
    const grand = grandHost.attachShadow({ mode: "open" })

    const outerId = registerHeld(reg, outer)
    reg.register("shadow:mid", {
      ref: inner,
      parent: outerId,
      contentEpoch: 0,
      hold: { install: () => {}, release: () => {} },
    })
    reg.register("shadow:grand", {
      ref: grand,
      parent: "shadow:mid",
      contentEpoch: 0,
      hold: { install: () => {}, release: () => {} },
    })

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project("shadow:grand")
    await flushAll()
    const carrier = addViolatedCarrier(grand)

    theming.project(outerId)
    await flushAll()

    expect(carrier.getAttribute(REPAIR_ATTR)).toBe(
      "rgb(0, 0, 0)~rgb(20, 20, 20)"
    )
  })

  it("leaves a committed scope alone when it is not a descendant of the committing one", async () => {
    const reg = registry()
    const a = nestedScopes()
    const b = nestedScopes()
    const aOuterId = registerHeld(reg, a.outer)
    const bOuterId = registerHeld(reg, b.outer)
    reg.register("shadow:unrelated-inner", {
      ref: b.inner,
      parent: bOuterId,
      contentEpoch: 0,
      hold: { install: () => {}, release: () => {} },
    })

    const theming = createShadowScopeTheming(
      reg,
      () => swatch,
      () => 0
    )
    theming.project("shadow:unrelated-inner")
    await flushAll()
    const carrier = addViolatedCarrier(b.inner)

    theming.project(aOuterId)
    await flushAll()

    expect(carrier.hasAttribute(REPAIR_ATTR)).toBe(false)
  })
})

describe("createShadowScopeTheming.project — every exit that moves a realization re-contrasts (#1342, bot-found)", () => {
  /**
   * The re-contrast used to sit beside the commit path only, so both
   * exoneration paths tore a realization down and returned silently — a
   * descendant resolving its backdrop into that scope kept diagnostics and
   * a repair calculated against the old themed backdrop.
   *
   * The ancestor's own surface is a *sibling* of the nested host rather than
   * its parent: jsdom applies no stylesheet to `getComputedStyle` and caches
   * an element's computed style permanently after the first read, so the
   * real backdrop chain cannot be exercised here at all (see this file's
   * other nested block). What these pin is the mechanism — which exits
   * report, and which correctly do not.
   */
  function scopeWithCommittedDescendant(): {
    outerId: ScopeId
    descendantId: ScopeId
    reg: ShadowSceneRegistry
    theming: ShadowScopeTheming
    carrier: HTMLElement
    outer: ShadowRoot
    surface: HTMLElement
    swatchRef: { current: Swatch | null }
  } {
    const reg = registry()
    const outer = shadowRoot()
    const surface = document.createElement("div")
    surface.setAttribute("style", "background-color: rgb(255, 255, 255)")
    const innerHost = document.createElement("div")
    outer.append(surface, innerHost)
    const inner = innerHost.attachShadow({ mode: "open" })

    const outerId = registerHeld(reg, outer)
    reg.register("shadow:desc", {
      ref: inner,
      parent: outerId,
      contentEpoch: 0,
      hold: { install: () => {}, release: () => {} },
    })

    const panel = document.createElement("div")
    panel.setAttribute("style", "background-color: rgb(20, 20, 20)")
    const carrier = document.createElement("div")
    carrier.setAttribute("style", "color: rgb(0, 0, 0)")
    carrier.textContent = "descendant"
    panel.appendChild(carrier)
    inner.appendChild(panel)

    const swatchRef: { current: Swatch | null } = { current: swatch }
    return {
      outerId,
      descendantId: "shadow:desc",
      reg,
      theming: createShadowScopeTheming(
        reg,
        () => swatchRef.current,
        () => 0
      ),
      carrier,
      outer,
      surface,
      swatchRef,
    }
  }

  /** Commits both scopes, then clears the descendant's tags so a later re-contrast is unambiguous. */
  async function settleBoth(
    theming: ShadowScopeTheming,
    outerId: ScopeId,
    descendantId: ScopeId,
    carrier: HTMLElement
  ): Promise<void> {
    theming.project(descendantId)
    theming.project(outerId)
    await flushAll()
    carrier.removeAttribute(REPAIR_ATTR)
    carrier.removeAttribute(LEGIBILITY_ATTR)
  }

  it("re-contrasts descendants when an ancestor exonerates as restore-native", async () => {
    const { outerId, descendantId, reg, theming, carrier, outer, surface } =
      scopeWithCommittedDescendant()

    await settleBoth(theming, outerId, descendantId, carrier)
    expect(reg.stateOf(outerId)?.kind).toBe("COMMITTED")

    // *Fresh* elements, not restyled ones: jsdom caches computed style after
    // the first read, so mutating `surface` in place would leave the scan
    // still seeing white. Three distinct dark keys is
    // MIN_EVIDENCE_FOR_DARK_VERDICT, the bar pageAlreadyDark() checks.
    surface.remove()
    for (const color of ["rgb(5, 5, 5)", "rgb(6, 6, 6)", "rgb(7, 7, 7)"]) {
      const el = document.createElement("div")
      el.setAttribute("style", `background-color: ${color}`)
      outer.appendChild(el)
    }

    reg.invalidate(outerId)
    theming.project(outerId)
    await flushAll()

    expect(reg.stateOf(outerId)?.kind).toBe("EXONERATED_NATIVE")
    expect(
      carrier.getAttribute(REPAIR_ATTR),
      "tearing an ancestor's realization down moves its descendants' backdrops too"
    ).toBe("rgb(0, 0, 0)~rgb(20, 20, 20)")
  })

  it("re-contrasts descendants when an ancestor exonerates for no-swatch", async () => {
    const { outerId, descendantId, reg, theming, carrier, swatchRef } =
      scopeWithCommittedDescendant()

    await settleBoth(theming, outerId, descendantId, carrier)
    expect(reg.stateOf(outerId)?.kind).toBe("COMMITTED")

    swatchRef.current = null
    reg.invalidate(outerId)
    theming.project(outerId)
    await flushAll()

    expect(reg.stateOf(outerId)?.kind).toBe("EXONERATED_NATIVE")
    expect(carrier.getAttribute(REPAIR_ATTR)).toBe(
      "rgb(0, 0, 0)~rgb(20, 20, 20)"
    )
  })

  it("does not re-contrast when an exoneration round had nothing to tear down", async () => {
    // The other half of the same finding: a scope that never committed
    // clears nothing, so its descendants' backdrops did not move. Reporting
    // unconditionally would trade a missed pass for a repeated one on every
    // round of a natively-dark scope.
    const { outerId, descendantId, reg, theming, carrier, swatchRef } =
      scopeWithCommittedDescendant()

    theming.project(descendantId)
    await flushAll()
    carrier.removeAttribute(REPAIR_ATTR)

    swatchRef.current = null
    theming.project(outerId)
    await flushAll()

    expect(reg.stateOf(outerId)?.kind).toBe("EXONERATED_NATIVE")
    expect(
      carrier.hasAttribute(REPAIR_ATTR),
      "nothing was torn down, so no descendant needed re-auditing"
    ).toBe(false)
  })
})
