import { DOCUMENT_SCOPE_ID } from "@filter/adapter/document-scope"
import {
  createScopeRegistry,
  type ScopeRegistry,
} from "@filter/adapter/scope-registry"
import {
  createShadowScopeDiscovery,
  DISCOVERY_POLL_MS,
  isElementNode,
} from "@filter/adapter/shadow-scope-discovery"
import { afterEach, describe, expect, it, vi } from "vitest"

const HOLD_SELECTOR = "[data-scope-registry-hold]"

/** Lets a jsdom MutationObserver's microtask-queued callback run. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function registry(): ScopeRegistry<string, { reason: string }> {
  return createScopeRegistry<string, { reason: string }>()
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("createShadowScopeDiscovery — discovery and registration (Corollary D.3.1)", () => {
  it("registers a newly-found open shadow root HELD, synchronously, with a real occlusion engaged inside it", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })
    shadow.appendChild(document.createElement("div"))

    const reg = registry()
    const discovery = createShadowScopeDiscovery(reg, () => 0)
    discovery.discover(document)

    const ids = reg.ids()
    expect(ids).toHaveLength(1)
    const id = ids[0]
    expect(id).toBeDefined()
    if (id === undefined) return
    expect(reg.stateOf(id)?.kind).toBe("HELD")
    expect(reg.snapshot(id)?.parent).toBe(DOCUMENT_SCOPE_ID)
    expect(shadow.querySelector(HOLD_SELECTOR)).not.toBeNull()
  })

  it("is idempotent — a second discover() does not re-register an already-known root", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    host.attachShadow({ mode: "open" })

    const reg = registry()
    const discovery = createShadowScopeDiscovery(reg, () => 0)
    discovery.discover(document)
    discovery.discover(document)
    discovery.discover(document)

    expect(reg.ids()).toHaveLength(1)
  })

  it("recurses into a nested shadow root, parenting it under the outer scope's own id", () => {
    const outerHost = document.createElement("div")
    document.body.appendChild(outerHost)
    const outerShadow = outerHost.attachShadow({ mode: "open" })
    const innerHost = document.createElement("div")
    outerShadow.appendChild(innerHost)
    innerHost.attachShadow({ mode: "open" })

    const reg = registry()
    const discovery = createShadowScopeDiscovery(reg, () => 0)
    discovery.discover(document)

    expect(reg.ids()).toHaveLength(2)
    const outerId = reg
      .ids()
      .find((id) => reg.snapshot(id)?.parent === DOCUMENT_SCOPE_ID)
    const innerId = reg.ids().find((id) => id !== outerId)
    expect(outerId).toBeDefined()
    expect(innerId).toBeDefined()
    if (outerId === undefined || innerId === undefined) return
    expect(reg.snapshot(innerId)?.parent).toBe(outerId)
  })

  it("retires and purges a previously-registered scope once its host disconnects", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })

    const reg = registry()
    const discovery = createShadowScopeDiscovery(reg, () => 0)
    discovery.discover(document)
    const id = reg.ids()[0]
    expect(id).toBeDefined()
    if (id === undefined) return
    expect(reg.stateOf(id)?.kind).toBe("HELD")

    host.remove()
    discovery.discover(document)

    // purge()d, not just retired — scope-registry.ts's own record (and its
    // strong reference to `shadow`) is gone, not merely transitioned.
    expect(reg.isRegistered(id)).toBe(false)
    expect(reg.stateOf(id)).toBeUndefined()

    // Reattaching the *same* physical host is a new scope with fresh
    // identity (Definition D.5's "RETIRED is absorbing... a later
    // re-attachment... is a new scope") — proves idFor's own stale mapping
    // was cleared too, not just the registry's record.
    document.body.appendChild(host)
    discovery.discover(document)
    expect(reg.ids()).toHaveLength(1)
    const newId = reg.ids()[0]
    expect(newId).toBeDefined()
    if (newId === undefined) return
    expect(reg.stateOf(newId)?.kind).toBe("HELD")
    expect(shadow.querySelector(HOLD_SELECTOR)).not.toBeNull()
  })
})

describe("createShadowScopeDiscovery — per-root reactive re-arming", () => {
  it("a non-self-authored mutation inside a COMMITTED scope invalidates it back toward HELD", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })

    const reg = registry()
    const discovery = createShadowScopeDiscovery(reg, () => 0)
    discovery.discover(document)
    const id = reg.ids()[0]
    expect(id).toBeDefined()
    if (id === undefined) return

    reg.startResolving(id)
    await reg.resolveCommitted(id, {
      revision: "swatch",
      install: () => {},
      uninstall: () => {},
    })
    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")

    const vendorNode = document.createElement("div")
    shadow.appendChild(vendorNode)
    await flushMicrotasks()

    expect(reg.stateOf(id)?.kind).toBe("RESOLVING")
  })

  it("leaves a HELD scope alone on a vendor mutation — nothing to invalidate", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })

    const reg = registry()
    const discovery = createShadowScopeDiscovery(reg, () => 0)
    discovery.discover(document)
    const id = reg.ids()[0]
    expect(id).toBeDefined()
    if (id === undefined) return

    shadow.appendChild(document.createElement("div"))
    await flushMicrotasks()

    expect(reg.stateOf(id)?.kind).toBe("HELD")
  })

  it("recurses for a newly-appearing nested shadow host introduced by a later mutation", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })

    const reg = registry()
    const discovery = createShadowScopeDiscovery(reg, () => 0)
    discovery.discover(document)
    expect(reg.ids()).toHaveLength(1)

    const nestedHost = document.createElement("div")
    shadow.appendChild(nestedHost)
    nestedHost.attachShadow({ mode: "open" })
    await flushMicrotasks()

    expect(reg.ids()).toHaveLength(2)
  })

  it("Axiom 3.5, extended: the occlusion hold's own release() upon a legitimate commit is never mistaken for vendor evidence", async () => {
    // resolveCommitted()'s own two-phase handoff calls hold.release() as
    // part of successfully reaching COMMITTED — a childList mutation
    // (removing the veil) that this same shadow scope's per-root observer
    // also sees. isSelfAuthored's usual "removal is never self-authored"
    // rule (Remark 7.2 — calibrated for a *hostile* removal, where reacting
    // costs one harmless extra round) is the wrong call for this specific
    // element: reacting here means invalidate(), which is not harmless —
    // it would immediately bounce the commit this exact release() call just
    // achieved back to RESOLVING. custody-primitive.ts's exported HOLD_ATTR
    // is what lets this module's own isHoldChurn tell the two apart.
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })

    const reg = registry()
    const discovery = createShadowScopeDiscovery(reg, () => 0)
    discovery.discover(document)
    const id = reg.ids()[0]
    expect(id).toBeDefined()
    if (id === undefined) return

    reg.startResolving(id)
    await reg.resolveCommitted(id, {
      revision: "swatch",
      install: () => {},
      uninstall: () => {},
    })
    // Let the per-root observer's queued microtask (from hold.release()'s
    // own veil removal) actually run before asserting.
    await flushMicrotasks()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    expect(shadow.querySelector(HOLD_SELECTOR)).toBeNull()
  })
})

describe("createShadowScopeDiscovery — observe()/teardown() lifecycle", () => {
  it("observe() reactively discovers a shadow root introduced by a later light-DOM mutation, with no explicit discover() call", async () => {
    const reg = registry()
    const discovery = createShadowScopeDiscovery(reg, () => 0)
    discovery.observe()

    const host = document.createElement("div")
    host.attachShadow({ mode: "open" })
    document.body.appendChild(host)
    await flushMicrotasks()

    expect(reg.ids()).toHaveLength(1)
    discovery.teardown()
  })

  it("teardown() retires every registered scope, releasing its hold, and stops reacting to further mutations", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })

    const reg = registry()
    const discovery = createShadowScopeDiscovery(reg, () => 0)
    discovery.discover(document)
    discovery.observe()
    const id = reg.ids()[0]
    expect(id).toBeDefined()
    if (id === undefined) return
    expect(shadow.querySelector(HOLD_SELECTOR)).not.toBeNull()

    discovery.teardown()

    // purge()d, not just retired — see the discover()/retirement test above
    // for why leaving the record (or idFor's mapping) behind is itself a bug.
    expect(reg.isRegistered(id)).toBe(false)
    expect(shadow.querySelector(HOLD_SELECTOR)).toBeNull()

    const secondHost = document.createElement("div")
    secondHost.attachShadow({ mode: "open" })
    document.body.appendChild(secondHost)
    await flushMicrotasks()

    // The top-level observer was disconnected by teardown() — nothing
    // reacts to this new host at all.
    expect(reg.ids()).toHaveLength(0)
  })
})

describe("createShadowScopeDiscovery — periodic poll backstop (SS_poll, canon §3.2)", () => {
  it("discovers a shadow root whose attachShadow() call happens well after its host's own insertion, with no further light-DOM mutation", async () => {
    // Simulates a custom element upgraded some time after it was already
    // connected (its definition loading late) — attachShadow() itself
    // produces no observable mutation (G0.4), so the reactive top-level
    // observer's own callback, having already run for the host's insertion
    // and found nothing, has nothing left to react to. Only the periodic
    // poll can still find it. Bot-found (#1267's own review).
    vi.useFakeTimers()
    try {
      const reg = registry()
      const discovery = createShadowScopeDiscovery(reg, () => 0)
      discovery.observe()

      const host = document.createElement("div")
      document.body.appendChild(host)
      await Promise.resolve()
      await Promise.resolve()
      expect(reg.ids()).toHaveLength(0)

      // The "late upgrade": attachShadow() + populate, well after insertion,
      // with no accompanying light-DOM mutation for the observer to see.
      const shadow = host.attachShadow({ mode: "open" })
      shadow.appendChild(document.createElement("div"))

      vi.advanceTimersByTime(DISCOVERY_POLL_MS)

      expect(reg.ids()).toHaveLength(1)
      expect(shadow.querySelector(HOLD_SELECTOR)).not.toBeNull()

      discovery.teardown()
    } finally {
      vi.useRealTimers()
    }
  })

  it("discovers a *nested* late attachShadow() inside an already-registered outer root", async () => {
    // A plain top-level re-walk from document.documentElement finds only
    // the outer host again on every call (already in idFor) and, by
    // design, never re-descends into an already-known root on its own —
    // without rewalkKnownRoots(), a nested late upgrade would stay
    // undiscovered indefinitely, not just for one poll interval.
    // Bot-found (#1267's own review, round 2).
    vi.useFakeTimers()
    try {
      const reg = registry()
      const discovery = createShadowScopeDiscovery(reg, () => 0)
      discovery.observe()

      const outerHost = document.createElement("div")
      document.body.appendChild(outerHost)
      const outerShadow = outerHost.attachShadow({ mode: "open" })
      const innerHost = document.createElement("div")
      outerShadow.appendChild(innerHost)
      await Promise.resolve()
      await Promise.resolve()
      expect(reg.ids()).toHaveLength(1)

      // The nested "late upgrade": attachShadow() on innerHost, well after
      // it was already connected inside outerShadow, with no accompanying
      // mutation inside outerShadow for its per-root observer to see.
      const innerShadow = innerHost.attachShadow({ mode: "open" })

      vi.advanceTimersByTime(DISCOVERY_POLL_MS)

      expect(reg.ids()).toHaveLength(2)
      expect(innerShadow.querySelector(HOLD_SELECTOR)).not.toBeNull()
      const outerId = reg
        .ids()
        .find((id) => reg.snapshot(id)?.parent === DOCUMENT_SCOPE_ID)
      const innerId = reg.ids().find((id) => id !== outerId)
      expect(outerId).toBeDefined()
      expect(innerId).toBeDefined()
      if (outerId === undefined || innerId === undefined) return
      expect(reg.snapshot(innerId)?.parent).toBe(outerId)

      discovery.teardown()
    } finally {
      vi.useRealTimers()
    }
  })

  it("teardown() stops the poll — no further discovery after it", () => {
    vi.useFakeTimers()
    try {
      const reg = registry()
      const discovery = createShadowScopeDiscovery(reg, () => 0)
      discovery.observe()
      discovery.teardown()

      const host = document.createElement("div")
      document.body.appendChild(host)
      host.attachShadow({ mode: "open" })

      vi.advanceTimersByTime(DISCOVERY_POLL_MS * 3)

      expect(reg.ids()).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("isElementNode — realm-independent, unlike `instanceof Element`", () => {
  it("recognises a same-realm element (the common case)", () => {
    expect(isElementNode(document.createElement("div"))).toBe(true)
    expect(isElementNode(document.createTextNode("x"))).toBe(false)
  })

  it("recognises an element adopted from a different realm's own Element constructor, where instanceof Element fails", () => {
    const iframe = document.createElement("iframe")
    document.body.appendChild(iframe)
    const foreignDoc = iframe.contentDocument
    expect(foreignDoc).not.toBeNull()
    if (foreignDoc === null) return

    const foreignEl = foreignDoc.createElement("div")

    // The exact failure isElementNode exists to route around — proves this
    // test actually reproduces the cross-realm gap, not a same-realm no-op.
    expect(foreignEl instanceof Element).toBe(false)
    expect(isElementNode(foreignEl)).toBe(true)

    iframe.remove()
  })
})

describe("createShadowScopeDiscovery — cross-realm adopted host (bot-found, #1267's own review)", () => {
  it("discovers and registers a shadow root on a host adopted from a different-realm iframe document", () => {
    const iframe = document.createElement("iframe")
    document.body.appendChild(iframe)
    const foreignDoc = iframe.contentDocument
    expect(foreignDoc).not.toBeNull()
    if (foreignDoc === null) return

    // Created in the iframe's own realm, then adopted into the top document
    // — appendChild() across documents adopts implicitly, same as a real
    // page moving DOM across a same-origin iframe boundary.
    const foreignHost = foreignDoc.createElement("div")
    expect(foreignHost instanceof Element).toBe(false)
    document.body.appendChild(foreignHost)
    const shadow = foreignHost.attachShadow({ mode: "open" })

    const reg = registry()
    const discovery = createShadowScopeDiscovery(reg, () => 0)
    discovery.discover(document)

    expect(reg.ids()).toHaveLength(1)
    expect(shadow.querySelector(HOLD_SELECTOR)).not.toBeNull()

    iframe.remove()
  })
})

describe("createShadowScopeDiscovery — z-index stacking-order reassertion (bot-found, #1267's own review)", () => {
  it("re-stacks a HELD scope's hold to the end on a vendor mutation, so it keeps winning an equal-z-index tie", async () => {
    // The hold's own z-index is the CSS maximum; CSS's tie-break rule for
    // equal-z stacking contexts is document order (later wins). A vendor
    // element inserted after the hold, sharing that same maximal z-index,
    // would otherwise paint on top of it indefinitely once the scope
    // settles into HELD — install()'s idempotency guard alone never moves
    // an already-connected veil.
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })

    const reg = registry()
    const discovery = createShadowScopeDiscovery(reg, () => 0)
    discovery.discover(document)
    expect(reg.ids()).toHaveLength(1)
    expect(
      shadow.lastElementChild?.hasAttribute("data-scope-registry-hold")
    ).toBe(true)

    // A vendor element, sharing the hold's own maximal z-index, inserted
    // after it.
    const vendorMaxZ = document.createElement("div")
    vendorMaxZ.setAttribute("style", "position:fixed;z-index:2147483647;")
    shadow.appendChild(vendorMaxZ)
    await flushMicrotasks()

    // Without reassert(), the veil would now be the second-to-last child —
    // losing the equal-z tie to vendorMaxZ, which comes after it.
    expect(
      shadow.lastElementChild?.hasAttribute("data-scope-registry-hold")
    ).toBe(true)
    expect(shadow.lastElementChild).not.toBe(vendorMaxZ)

    discovery.teardown()
  })
})

describe("createShadowScopeDiscovery — retirement checks reachability from the recorded parent (bot-found, #1267's own review)", () => {
  it("retires a scope whose host moved to a different connected location, even though isConnected stays true throughout", () => {
    // A registered nested scope's host moved directly under document.body —
    // still `isConnected` (attached to the same top document throughout),
    // but no longer reachable from its recorded parent (the outer shadow
    // root it was originally discovered inside).
    const outerHost = document.createElement("div")
    document.body.appendChild(outerHost)
    const outerShadow = outerHost.attachShadow({ mode: "open" })
    const innerHost = document.createElement("div")
    outerShadow.appendChild(innerHost)
    const innerShadow = innerHost.attachShadow({ mode: "open" })

    const reg = registry()
    const discovery = createShadowScopeDiscovery(reg, () => 0)
    discovery.discover(document)
    expect(reg.ids()).toHaveLength(2)
    const innerId = reg
      .ids()
      .find((id) => reg.snapshot(id)?.parent !== DOCUMENT_SCOPE_ID)
    expect(innerId).toBeDefined()
    if (innerId === undefined) return

    // Move innerHost out from under outerShadow, directly into the main
    // document — still connected, just no longer under its recorded parent.
    document.body.appendChild(innerHost)
    expect(innerHost.isConnected).toBe(true)

    discovery.discover(document)

    // The *old* id is retired and purged — never left standing.
    expect(reg.isRegistered(innerId)).toBe(false)
    // But innerShadow is still reachable (now directly from the document),
    // so this same discover() call also re-registers it fresh, under a new
    // id with its own new hold — Definition D.5's "a later re-attachment...
    // is a new scope with fresh identity," applied within a single pass so
    // there is no round where it is reachable but neither registered nor
    // held (retireDetached() now runs before the walks that follow it, in
    // every call site — bot-found, #1267's own review, round 5).
    expect(reg.ids()).toHaveLength(2)
    expect(reg.ids()).not.toContain(innerId)
    const freshInnerId = reg
      .ids()
      .find((id) => reg.snapshot(id)?.ref === innerShadow)
    expect(freshInnerId).toBeDefined()
    expect(reg.snapshot(freshInnerId ?? "")?.parent).toBe(DOCUMENT_SCOPE_ID)
    expect(innerShadow.querySelector(HOLD_SELECTOR)).not.toBeNull()

    discovery.teardown()
  })

  it("cascades retirement to a nested scope in the same pass its parent retires", () => {
    const outerHost = document.createElement("div")
    document.body.appendChild(outerHost)
    const outerShadow = outerHost.attachShadow({ mode: "open" })
    const innerHost = document.createElement("div")
    outerShadow.appendChild(innerHost)
    innerHost.attachShadow({ mode: "open" })

    const reg = registry()
    const discovery = createShadowScopeDiscovery(reg, () => 0)
    discovery.discover(document)
    expect(reg.ids()).toHaveLength(2)

    // Detach the outer host entirely — the inner scope's own host stays
    // connected *to outerShadow*, but outerShadow itself is no longer
    // reachable from the document.
    outerHost.remove()

    discovery.discover(document)

    expect(reg.ids()).toHaveLength(0)

    discovery.teardown()
  })
})

describe("createShadowScopeDiscovery — isHoldMutation survives marker stripping (bot-found, #1267's own review, round 6)", () => {
  it("still correctly distinguishes the hold's own churn from genuine vendor evidence after HOLD_ATTR/data-my-ext are stripped from the veil", async () => {
    // The exact loop this story's own review found: an attribute-based
    // identity check (the old isHoldChurn) stops recognising the veil once
    // its own markers are gone — including the removal half of this hold's
    // own reassert()-driven remove-then-insert churn (the DOM's pre-insert
    // algorithm generates that pair even when appendChild-ing an
    // already-last-child node) — misreading it as vendor evidence and
    // calling reassert() again without bound. isHoldMutation's identity
    // check must survive the marker being stripped for this to terminate.
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })

    const reg = registry()
    const discovery = createShadowScopeDiscovery(reg, () => 0)
    discovery.discover(document)
    const id = reg.ids()[0]
    expect(id).toBeDefined()
    if (id === undefined) return

    reg.startResolving(id)
    await reg.resolveCommitted(id, {
      revision: "swatch",
      install: () => {},
      uninstall: () => {},
    })
    await flushMicrotasks()
    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")

    // COMMITTED released the veil (no successor artifact to install first —
    // see NativeExoneration's own doc comment for the committed case: the
    // hold IS the successor here). invalidate() re-engages it (COMMITTED ->
    // RESOLVING, with hold.install() run as part of that transition) so
    // there is a live veil to attack.
    reg.invalidate(id)
    await flushMicrotasks()
    expect(reg.stateOf(id)?.kind).toBe("RESOLVING")
    const veil = shadow.querySelector(HOLD_SELECTOR)
    expect(veil).not.toBeNull()
    if (veil === null) return
    veil.removeAttribute("data-scope-registry-hold")
    veil.removeAttribute("data-my-ext")

    // Re-commit with the markers gone, then prove a genuine vendor mutation
    // still invalidates it correctly — the same assertion as the
    // marker-intact test above, now under attack. Already RESOLVING from
    // invalidate() above, so resolveCommitted() can run directly.
    await reg.resolveCommitted(id, {
      revision: "swatch",
      install: () => {},
      uninstall: () => {},
    })
    await flushMicrotasks()
    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")

    const vendorNode = document.createElement("div")
    shadow.appendChild(vendorNode)
    await flushMicrotasks()

    expect(reg.stateOf(id)?.kind).toBe("RESOLVING")

    discovery.teardown()
  })
})

describe("createShadowScopeDiscovery — onScopeReady (SF-AD, #1268)", () => {
  it("fires once a newly-discovered scope is registered, before discover() returns", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    host.attachShadow({ mode: "open" })

    const reg = registry()
    const ready: Array<string> = []
    const discovery = createShadowScopeDiscovery(
      reg,
      () => 0,
      (id) => ready.push(id)
    )
    discovery.discover(document)

    expect(ready).toEqual(reg.ids())
  })

  it("fires again after a genuine vendor mutation, alongside invalidate()", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })

    const reg = registry()
    const ready: Array<string> = []
    const discovery = createShadowScopeDiscovery(
      reg,
      () => 0,
      (id) => ready.push(id)
    )
    discovery.discover(document)
    const id = reg.ids()[0]
    expect(id).toBeDefined()
    if (id === undefined) return
    expect(ready).toEqual([id])

    shadow.appendChild(document.createElement("div"))
    await flushMicrotasks()

    expect(ready).toEqual([id, id])

    discovery.teardown()
  })

  it("is not called again for a mutation that is purely the hold's own churn", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })

    const reg = registry()
    const ready: Array<string> = []
    const discovery = createShadowScopeDiscovery(
      reg,
      () => 0,
      (id) => ready.push(id)
    )
    discovery.discover(document)
    const id = reg.ids()[0]
    expect(id).toBeDefined()
    if (id === undefined) return
    expect(ready).toEqual([id])

    reg.startResolving(id)
    await reg.resolveCommitted(id, {
      revision: "swatch",
      install: () => {},
      uninstall: () => {},
    })
    // resolveCommitted()'s own release() of the hold is a childList mutation
    // on this same root — isHoldMutation must keep this from re-firing
    // onScopeReady, the same way it keeps it from re-invalidating.
    await flushMicrotasks()

    expect(ready).toEqual([id])
    expect(shadow.querySelector(HOLD_SELECTOR)).toBeNull()

    discovery.teardown()
  })
})

describe("createShadowScopeDiscovery — isThemeTaggingMutation (SF-AD, #1268)", () => {
  it("does not invalidate a COMMITTED scope when the only mutation is its own data-sw-patched write", async () => {
    // The exact regression SF-AD's own realization would otherwise cause:
    // shadow-scope-theming.ts's tagSurfaceElements() sets data-sw-patched on
    // a classified element *inside* the shadow root it just committed — an
    // attributes record this observer (attributes: true, no
    // attributeFilter) does see. Without isThemeTaggingMutation, that write
    // would misread as vendor evidence and immediately invalidate the very
    // commit it is part of.
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })
    const surface = document.createElement("div")
    shadow.appendChild(surface)

    const reg = registry()
    const discovery = createShadowScopeDiscovery(reg, () => 0)
    discovery.discover(document)
    const id = reg.ids()[0]
    expect(id).toBeDefined()
    if (id === undefined) return

    reg.startResolving(id)
    await reg.resolveCommitted(id, {
      revision: "swatch",
      install: () => {},
      uninstall: () => {},
    })
    await flushMicrotasks()
    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")

    surface.dataset.swPatched = "rgb(255, 255, 255)"
    await flushMicrotasks()

    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")

    discovery.teardown()
  })

  it("still invalidates when a data-sw-patched write is mixed with a real vendor mutation in the same batch", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })
    const surface = document.createElement("div")
    shadow.appendChild(surface)

    const reg = registry()
    const discovery = createShadowScopeDiscovery(reg, () => 0)
    discovery.discover(document)
    const id = reg.ids()[0]
    expect(id).toBeDefined()
    if (id === undefined) return

    reg.startResolving(id)
    await reg.resolveCommitted(id, {
      revision: "swatch",
      install: () => {},
      uninstall: () => {},
    })
    await flushMicrotasks()
    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")

    // Both mutations land in the same synchronous task, so the observer
    // sees them as one batch.
    surface.dataset.swPatched = "rgb(255, 255, 255)"
    shadow.appendChild(document.createElement("div"))
    await flushMicrotasks()

    expect(reg.stateOf(id)?.kind).toBe("RESOLVING")

    discovery.teardown()
  })
})

describe("createShadowScopeDiscovery — host class/style reprojection (bot-found, SF-AD's own review)", () => {
  it("invalidates a COMMITTED scope and calls onScopeReady when its own host's class changes, with no mutation inside the shadow root itself", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    host.attachShadow({ mode: "open" })

    const reg = registry()
    const ready: Array<string> = []
    const discovery = createShadowScopeDiscovery(
      reg,
      () => 0,
      (id) => ready.push(id)
    )
    discovery.discover(document)
    const id = reg.ids()[0]
    expect(id).toBeDefined()
    if (id === undefined) return

    reg.startResolving(id)
    await reg.resolveCommitted(id, {
      revision: "swatch",
      install: () => {},
      uninstall: () => {},
    })
    await flushMicrotasks()
    expect(reg.stateOf(id)?.kind).toBe("COMMITTED")
    ready.length = 0

    // Nothing inside `shadow` itself changes — only the host's own class,
    // in its parent (light-DOM) scope. The per-root observer inside
    // registerShadowRoot has nothing to react to; only a dedicated observer
    // on the host itself can see this.
    host.className = "dark-variant"
    await flushMicrotasks()

    expect(reg.stateOf(id)?.kind).toBe("RESOLVING")
    expect(ready).toEqual([id])

    discovery.teardown()
  })

  it("reprojects a still-HELD (never-committed) scope on its host's own style change too", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    host.attachShadow({ mode: "open" })

    const reg = registry()
    const ready: Array<string> = []
    const discovery = createShadowScopeDiscovery(
      reg,
      () => 0,
      (id) => ready.push(id)
    )
    discovery.discover(document)
    const id = reg.ids()[0]
    expect(id).toBeDefined()
    if (id === undefined) return
    ready.length = 0

    host.setAttribute("style", "--accent: red")
    await flushMicrotasks()

    expect(reg.stateOf(id)?.kind).toBe("HELD")
    expect(ready).toEqual([id])

    discovery.teardown()
  })

  it("does not react to a class/style change on an unrelated sibling element", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    host.attachShadow({ mode: "open" })
    const sibling = document.createElement("div")
    document.body.appendChild(sibling)

    const reg = registry()
    const ready: Array<string> = []
    const discovery = createShadowScopeDiscovery(
      reg,
      () => 0,
      (id) => ready.push(id)
    )
    discovery.discover(document)
    ready.length = 0

    sibling.className = "unrelated"
    await flushMicrotasks()

    expect(ready).toEqual([])

    discovery.teardown()
  })

  it("stops reacting to host attribute changes once retired", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    host.attachShadow({ mode: "open" })

    const reg = registry()
    const ready: Array<string> = []
    const discovery = createShadowScopeDiscovery(
      reg,
      () => 0,
      (id) => ready.push(id)
    )
    discovery.discover(document)
    const id = reg.ids()[0]
    expect(id).toBeDefined()
    if (id === undefined) return

    host.remove()
    discovery.discover(document)
    expect(reg.isRegistered(id)).toBe(false)
    ready.length = 0

    host.className = "still-mutating-after-retirement"
    await flushMicrotasks()

    expect(ready).toEqual([])

    discovery.teardown()
  })
})

describe("createShadowScopeDiscovery — onDiscovered (SF-OB, #1270)", () => {
  it("tags an explicit discover() sweep's own finds as census", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    host.attachShadow({ mode: "open" })

    const reg = registry()
    const found: Array<{ id: string; method: string }> = []
    const discovery = createShadowScopeDiscovery(
      reg,
      () => 0,
      undefined,
      (id, method) => found.push({ id, method })
    )
    discovery.discover(document)

    expect(found).toEqual([{ id: reg.ids()[0], method: "census" }])
  })

  it("a nested root found during the same registration pass inherits its parent's census method", () => {
    const outerHost = document.createElement("div")
    document.body.appendChild(outerHost)
    const outerShadow = outerHost.attachShadow({ mode: "open" })
    const innerHost = document.createElement("div")
    outerShadow.appendChild(innerHost)
    innerHost.attachShadow({ mode: "open" })

    const reg = registry()
    const found: Array<{ id: string; method: string }> = []
    const discovery = createShadowScopeDiscovery(
      reg,
      () => 0,
      undefined,
      (id, method) => found.push({ id, method })
    )
    discovery.discover(document)

    expect(found).toHaveLength(2)
    expect(found.every((f) => f.method === "census")).toBe(true)
  })

  it("tags a reactive top-level MutationObserver find as reactive, not census", async () => {
    const reg = registry()
    const found: Array<{ id: string; method: string }> = []
    const discovery = createShadowScopeDiscovery(
      reg,
      () => 0,
      undefined,
      (id, method) => found.push({ id, method })
    )
    discovery.observe()

    const host = document.createElement("div")
    host.attachShadow({ mode: "open" })
    document.body.appendChild(host)
    await flushMicrotasks()

    expect(found).toEqual([{ id: reg.ids()[0], method: "reactive" }])
    discovery.teardown()
  })

  it("tags a mutation-triggered nested find inside an already-registered root as reactive", async () => {
    const outerHost = document.createElement("div")
    document.body.appendChild(outerHost)
    const outerShadow = outerHost.attachShadow({ mode: "open" })

    const reg = registry()
    const found: Array<{ id: string; method: string }> = []
    const discovery = createShadowScopeDiscovery(
      reg,
      () => 0,
      undefined,
      (id, method) => found.push({ id, method })
    )
    discovery.discover(document)
    const outerId = reg.ids()[0]
    expect(outerId).toBeDefined()
    expect(found).toEqual([{ id: outerId, method: "census" }])
    found.length = 0

    const innerHost = document.createElement("div")
    outerShadow.appendChild(innerHost)
    innerHost.attachShadow({ mode: "open" })
    await flushMicrotasks()

    const innerId = reg.ids().find((id) => id !== outerId)
    expect(innerId).toBeDefined()
    expect(found).toEqual([{ id: innerId, method: "reactive" }])
    discovery.teardown()
  })

  it("tags a periodic-poll find as reactive (SS_poll, canon §3.2 — never a census sweep)", async () => {
    vi.useFakeTimers()
    try {
      const reg = registry()
      const found: Array<{ id: string; method: string }> = []
      const discovery = createShadowScopeDiscovery(
        reg,
        () => 0,
        undefined,
        (id, method) => found.push({ id, method })
      )
      discovery.observe()

      const host = document.createElement("div")
      document.body.appendChild(host)
      await Promise.resolve()
      await Promise.resolve()
      const shadow = host.attachShadow({ mode: "open" })
      shadow.appendChild(document.createElement("div"))

      vi.advanceTimersByTime(DISCOVERY_POLL_MS)

      expect(found).toEqual([{ id: reg.ids()[0], method: "reactive" }])
      discovery.teardown()
    } finally {
      vi.useRealTimers()
    }
  })

  it("is optional — omitting it changes nothing about discovery/custody itself", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    host.attachShadow({ mode: "open" })

    const reg = registry()
    const discovery = createShadowScopeDiscovery(reg, () => 0)
    expect(() => discovery.discover(document)).not.toThrow()
    expect(reg.ids()).toHaveLength(1)
  })
})
