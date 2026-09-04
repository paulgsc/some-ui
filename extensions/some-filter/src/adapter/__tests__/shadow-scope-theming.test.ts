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

afterEach(() => {
  document.body.innerHTML = ""
})

describe("createShadowScopeTheming.project — ineligible ids are a no-op", () => {
  it("does nothing for an unregistered id", () => {
    const reg = registry()
    const theming = createShadowScopeTheming(reg, swatch, () => 0)
    expect(() => theming.project("nope")).not.toThrow()
  })

  it("does nothing when the scope's ref is not a ShadowRoot (the document scope)", () => {
    const reg = registry()
    reg.register("r_0", {
      ref: document,
      parent: null,
      contentEpoch: 0,
      hold: { install: () => {}, release: () => {} },
    })
    const theming = createShadowScopeTheming(reg, swatch, () => 0)
    theming.project("r_0")
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

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
  })

  it("does nothing for a RETIRED scope", () => {
    const reg = registry()
    const shadow = shadowRoot()
    const id = registerHeld(reg, shadow)
    reg.retire(id)

    const theming = createShadowScopeTheming(reg, swatch, () => 0)
    expect(() => theming.project(id)).not.toThrow()
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
    await Promise.resolve()
    await Promise.resolve()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    expect(surface.dataset.swPatched).toBe("rgb(255, 255, 255)")
    expect(shadow.adoptedStyleSheets).toHaveLength(1)
  })

  it("does not tag or adopt anything for a scope with no evidenced surfaces", async () => {
    const reg = registry()
    const shadow = shadowRoot()
    const id = registerHeld(reg, shadow)

    const theming = createShadowScopeTheming(reg, swatch, () => 0)
    theming.project(id)
    await Promise.resolve()
    await Promise.resolve()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    expect(shadow.adoptedStyleSheets ?? []).toHaveLength(0)
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
    await Promise.resolve()
    await Promise.resolve()

    expect(reg.stateOf(outerId)?.kind).toBe("COMMITTED")
    expect(reg.stateOf(innerId)?.kind).toBe("COMMITTED")
    expect(surface.dataset.swPatched).toBe("rgb(255, 255, 255)")
    expect(inner.adoptedStyleSheets).toHaveLength(1)
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
    await Promise.resolve()
    await Promise.resolve()
    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    expect(surface.dataset.swPatched).toBe("rgb(255, 255, 255)")

    reg.invalidate(id)
    const nullTheming = createShadowScopeTheming(reg, null, () => 0)
    nullTheming.project(id)

    expect(reg.stateOf(id)?.kind).toBe("EXONERATED_NATIVE")
    expect(surface.hasAttribute("data-sw-patched")).toBe(false)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    expect(shadow.adoptedStyleSheets ?? []).toHaveLength(0)
  })

  it("exonerates with 'restore-native' when the scope's own content already reads dark, clearing a prior commit's own tags/colors", () => {
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

    expect(reg.stateOf(id)?.kind).toBe("EXONERATED_NATIVE")
    expect(staleSurface.hasAttribute("data-sw-patched")).toBe(false)
  })
})

describe("createShadowScopeTheming.project — a thrown scan/decide resolves FAILED_HELD, not an uncaught throw", () => {
  it("catches a scan() failure and transitions to FAILED_HELD", () => {
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
    spy.mockRestore()
    expect(reg.stateOf(id)?.kind).toBe("FAILED_HELD")

    theming.project(id)
    await Promise.resolve()
    await Promise.resolve()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
  })
})
