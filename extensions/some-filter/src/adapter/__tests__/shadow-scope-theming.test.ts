import { createScopeRegistry } from "@filter/adapter/scope-registry"
import {
  createShadowScopeTheming,
  type ShadowSceneRegistry,
} from "@filter/adapter/shadow-scope-theming"
import { DEFAULT_SWATCH_ID, SWATCHES } from "@filter/adapter/swatches"
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
    const theming = createShadowScopeTheming(reg, swatch, () => 0)
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
    const theming = createShadowScopeTheming(reg, swatch, () => 0)
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

    const theming = createShadowScopeTheming(reg, swatch, () => 0)
    theming.project(id)
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
  })

  it("does nothing for a RETIRED scope", async () => {
    const reg = registry()
    const shadow = shadowRoot()
    const id = registerHeld(reg, shadow)
    reg.retire(id)

    const theming = createShadowScopeTheming(reg, swatch, () => 0)
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

    const theming = createShadowScopeTheming(reg, swatch, () => 0)
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

    const theming = createShadowScopeTheming(reg, swatch, () => 0)
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

    const theming = createShadowScopeTheming(reg, swatch, () => 0)
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

    const theming = createShadowScopeTheming(reg, swatch, () => 0)
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

    const themedTheming = createShadowScopeTheming(reg, swatch, () => 0)
    themedTheming.project(id)
    await flushAll()
    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    expect(surface.dataset.swPatched).toBe("rgb(255, 255, 255)")

    reg.invalidate(id)
    const nullTheming = createShadowScopeTheming(reg, null, () => 0)
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
    const theming = createShadowScopeTheming(reg, swatch, () => 0)
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
      const theming = createShadowScopeTheming(reg, swatch, () => 0)
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
    const theming = createShadowScopeTheming(reg, swatch, () => 0)
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

    const theming = createShadowScopeTheming(reg, swatch, () => 0)
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

    const theming = createShadowScopeTheming(reg, swatch, () => 0)
    theming.project(id)
    theming.project(id)
    theming.project(id)
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    expect(surface.dataset.swPatched).toBe("rgb(255, 255, 255)")
    expect(shadow.adoptedStyleSheets.length).toBeGreaterThan(0)
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
    const theming = createShadowScopeTheming(reg, swatch, () => 0)
    theming.project(id)
    await flushAll()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")

    iframe.remove()
  })
})
