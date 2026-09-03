import { DOCUMENT_SCOPE_ID } from "@filter/adapter/document-scope"
import {
  createScopeRegistry,
  type ScopeRegistry,
} from "@filter/adapter/scope-registry"
import {
  createShadowScopeDiscovery,
  DISCOVERY_POLL_MS,
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
