import {
  createDocumentScopeCustodian,
  createPrepaintCustody,
  DOCUMENT_SCOPE_ID,
  type DocumentScopeCustodian,
  type FireOutcome,
} from "@filter/adapter/document-scope"
import {
  createScopeRegistry,
  type ScopeRegistry,
} from "@filter/adapter/scope-registry"
import {
  isPrepaintActive,
  PREPAINT_VEIL_ID,
} from "@filter/lib/content/prepaint"
import { afterEach, describe, expect, it, vi, type Mock } from "vitest"

afterEach(() => {
  dropVeil()
})

const OK_COMMITTED: FireOutcome = {
  kind: "ok",
  actions: [{ kind: "activate-theme", swatchId: "default" }],
}

const OK_COMMITTED_OTHER_SWATCH: FireOutcome = {
  kind: "ok",
  actions: [{ kind: "activate-theme", swatchId: "warm" }],
}

const OK_RESTORE_NATIVE: FireOutcome = {
  kind: "ok",
  actions: [{ kind: "restore-native" }],
}

const OK_NO_SWATCH: FireOutcome = { kind: "ok", actions: [] }

const ERROR_OUTCOME: FireOutcome = {
  kind: "error",
  error: new Error("decide() threw"),
}

// rAF is stubbed synchronous (vitest.setup.ts); a macrotask boundary drains
// the microtasks resolveCommitted()'s `await` still needs.
async function flushCommit(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const veil = (): HTMLElement | null => document.getElementById(PREPAINT_VEIL_ID)

/** Takes the veil down without telling the registry, as off mode's direct disablePrepaint() does. */
function dropVeil(): void {
  veil()?.remove()
  document.documentElement.classList.remove("sw-dirty")
}

/** A custodian with the document registered over the real prepaint custody. */
function registeredCustodian(): DocumentScopeCustodian {
  const custodian = createDocumentScopeCustodian()
  custodian.registerDocument(0)
  return custodian
}

/** A custodian over a registry whose document hold is a pair of spies. */
function spiedHoldCustodian(): {
  hold: { install: Mock; release: Mock }
  registry: ScopeRegistry<string, { reason: string }>
  custodian: DocumentScopeCustodian
} {
  const hold = { install: vi.fn(), release: vi.fn() }
  const registry = createScopeRegistry<string, { reason: string }>()
  const custodian = createDocumentScopeCustodian(registry)
  registry.register(DOCUMENT_SCOPE_ID, {
    ref: document,
    parent: null,
    contentEpoch: 0,
    hold,
  })
  return { hold, registry, custodian }
}

const COMMITTED_DEFAULT = { kind: "COMMITTED", revision: "default" }

describe("createDocumentScopeCustodian — registration (Corollary D.1.1)", () => {
  it("registers the document HELD via a real prepaint custody, engaging the existing veil", () => {
    const custodian = registeredCustodian()

    expect(custodian.registry.stateOf(DOCUMENT_SCOPE_ID)?.kind).toBe("HELD")
    expect(isPrepaintActive()).toBe(true)
    expect(veil()).not.toBeNull()
  })

  it("is idempotent — a second call does not re-register or throw", () => {
    const custodian = registeredCustodian()
    expect(() => custodian.registerDocument(0)).not.toThrow()
    expect(custodian.registry.ids()).toEqual([DOCUMENT_SCOPE_ID])
  })
})

describe("createDocumentScopeCustodian — failed rounds hold, verdicts release", () => {
  it("a thrown decide()/realize() produces FAILED_HELD and the real veil stays up", () => {
    const custodian = registeredCustodian()
    expect(veil()).not.toBeNull()

    custodian.reportPipelineOutcome(ERROR_OUTCOME)

    expect(custodian.registry.stateOf(DOCUMENT_SCOPE_ID)).toEqual({
      kind: "FAILED_HELD",
      epoch: { content: 0, scope: 0 },
      reason: "decide() threw",
    })
    // The actual DOM veil — not just the registry's belief — is still there.
    expect(isPrepaintActive()).toBe(true)
    expect(veil()).not.toBeNull()
  })

  it("a genuine restore-native verdict, by contrast, releases the veil immediately", () => {
    const custodian = registeredCustodian()

    custodian.reportPipelineOutcome(OK_RESTORE_NATIVE)

    expect(custodian.registry.stateOf(DOCUMENT_SCOPE_ID)?.kind).toBe(
      "EXONERATED_NATIVE"
    )
    expect(isPrepaintActive()).toBe(false)
    expect(veil()).toBeNull()
  })

  it("a committed theme releases the veil only after the atomic-swap gate settles", async () => {
    const custodian = registeredCustodian()

    custodian.reportPipelineOutcome(OK_COMMITTED)

    // resolveCommitted() is async even with rAF stubbed synchronous.
    expect(veil()).not.toBeNull()

    await flushCommit()

    expect(custodian.registry.stateOf(DOCUMENT_SCOPE_ID)).toMatchObject(
      COMMITTED_DEFAULT
    )
    expect(veil()).toBeNull()
  })

  it("an empty actions array (swatch === null) also exonerates, not fails", () => {
    const custodian = registeredCustodian()

    custodian.reportPipelineOutcome(OK_NO_SWATCH)

    expect(custodian.registry.stateOf(DOCUMENT_SCOPE_ID)).toMatchObject({
      kind: "EXONERATED_NATIVE",
      proof: { reason: "no-swatch" },
    })
  })
})

describe("createDocumentScopeCustodian — idempotent routing (#831-class guard)", () => {
  it("an unchanged verdict on a later fire does not re-touch the hold", async () => {
    const { hold, custodian } = spiedHoldCustodian()
    hold.install.mockClear()

    custodian.reportPipelineOutcome(OK_COMMITTED)
    await flushCommit()
    expect(hold.release).toHaveBeenCalledTimes(1)

    custodian.reportPipelineOutcome(OK_COMMITTED)
    await flushCommit()

    expect(hold.install).not.toHaveBeenCalled()
    expect(hold.release).toHaveBeenCalledTimes(1)
  })

  it("a genuinely different committed revision does re-drive the FSM", async () => {
    const { hold, registry, custodian } = spiedHoldCustodian()

    custodian.reportPipelineOutcome(OK_COMMITTED)
    await flushCommit()

    custodian.reportPipelineOutcome(OK_COMMITTED_OTHER_SWATCH)
    await flushCommit()

    expect(registry.stateOf(DOCUMENT_SCOPE_ID)).toMatchObject({
      kind: "COMMITTED",
      revision: "warm",
    })
    // invalidate() re-engaged the hold once between the two commits.
    expect(hold.install.mock.calls.length).toBeGreaterThanOrEqual(1)
  })

  it("repeated identical errors stay FAILED_HELD without re-throwing", () => {
    const custodian = registeredCustodian()

    custodian.reportPipelineOutcome(ERROR_OUTCOME)
    expect(() => custodian.reportPipelineOutcome(ERROR_OUTCOME)).not.toThrow()

    expect(custodian.registry.stateOf(DOCUMENT_SCOPE_ID)?.kind).toBe(
      "FAILED_HELD"
    )
  })

  it("reengage() makes an unchanged-looking verdict re-release a hold re-armed behind the custodian's back (yt-navigate-start/finish)", async () => {
    // nav-start re-arms the veil outside the custodian, then nav-finish's
    // rescan reports the *same* verdict; without reconciling, the unchanged
    // signature would short-circuit and the hold would never be released.
    const { hold, registry, custodian } = spiedHoldCustodian()

    custodian.reportPipelineOutcome(OK_COMMITTED)
    await flushCommit()
    expect(hold.release).toHaveBeenCalledTimes(1)

    custodian.reengage(0) // nav-start
    custodian.reportPipelineOutcome(OK_COMMITTED) // nav-finish's rescan
    await flushCommit()

    expect(hold.release).toHaveBeenCalledTimes(2)
    expect(registry.stateOf(DOCUMENT_SCOPE_ID)).toMatchObject(COMMITTED_DEFAULT)
  })
})

describe("reengage() — invalidating an in-flight resolveCommitted()", () => {
  it("a resolveCommitted() still awaiting its atomic-swap gate does not release a hold reengage() just re-armed", async () => {
    // Only a real transition bumps the per-scope generation that
    // resolveCommitted() checks before releasing; reRegister() is one.
    const { hold, registry, custodian } = spiedHoldCustodian()
    registry.startResolving(DOCUMENT_SCOPE_ID)
    hold.install.mockClear()

    // A committed round held open on its gate.
    let releaseInstall: (() => void) | undefined
    const install = new Promise<void>((resolve) => {
      releaseInstall = resolve
    })
    const uninstall = vi.fn()
    const pending = registry.resolveCommitted(DOCUMENT_SCOPE_ID, {
      revision: "default",
      install: () => install,
      uninstall,
    })

    // The re-arm races in while that round is still awaiting its gate.
    custodian.reengage(1)
    expect(hold.install).toHaveBeenCalledTimes(1)
    expect(registry.stateOf(DOCUMENT_SCOPE_ID)?.kind).toBe("HELD")

    releaseInstall?.()
    await pending

    // The stale completion backs off, uninstalling its orphaned realization.
    expect(hold.release).not.toHaveBeenCalled()
    expect(uninstall).toHaveBeenCalledTimes(1)
    expect(registry.stateOf(DOCUMENT_SCOPE_ID)?.kind).toBe("HELD")
  })
})

describe("createPrepaintCustody", () => {
  it("install()/release() are the real enablePrepaint()/disablePrepaint() — not a second veil", () => {
    const custody = createPrepaintCustody()
    custody.install()
    expect(document.querySelectorAll(`#${PREPAINT_VEIL_ID}`)).toHaveLength(1)
    custody.release()
    expect(veil()).toBeNull()
  })
})

describe("reengage() — recovering from off-mode's own direct disablePrepaint()", () => {
  it("without reengage(), a thrown round after off->auto produces FAILED_HELD with no real veil (documents the bug)", () => {
    const custodian = registeredCustodian()
    expect(veil()).not.toBeNull()

    dropVeil()
    expect(isPrepaintActive()).toBe(false)

    custodian.reportPipelineOutcome(ERROR_OUTCOME)

    expect(custodian.registry.stateOf(DOCUMENT_SCOPE_ID)?.kind).toBe(
      "FAILED_HELD"
    )
    // The registry claims the document is held; physically it is not.
    expect(isPrepaintActive()).toBe(false)
  })

  it("re-engages the real veil before the first round when called (the fix)", () => {
    const custodian = registeredCustodian()

    dropVeil()
    expect(isPrepaintActive()).toBe(false)

    custodian.reengage(0)
    expect(isPrepaintActive()).toBe(true)

    custodian.reportPipelineOutcome(ERROR_OUTCOME)

    expect(custodian.registry.stateOf(DOCUMENT_SCOPE_ID)?.kind).toBe(
      "FAILED_HELD"
    )
    // Now the claim is true: the veil really is up.
    expect(isPrepaintActive()).toBe(true)
  })

  it("is a no-op DOM-wise on a cold entry into auto — hold.install() is idempotent", () => {
    const { hold, registry, custodian } = spiedHoldCustodian()
    hold.install.mockClear()

    custodian.reengage(0)

    expect(hold.install).toHaveBeenCalledTimes(1)
    expect(registry.stateOf(DOCUMENT_SCOPE_ID)?.kind).toBe("HELD")
  })

  it("clears the idempotency cache — a verdict matching the pre-reengage cache still resolves", async () => {
    const custodian = registeredCustodian()

    custodian.reportPipelineOutcome(OK_COMMITTED)
    await flushCommit()
    expect(veil()).toBeNull()

    // off, then back to auto, landing on the same swatch as before.
    dropVeil()
    custodian.reengage(0)
    expect(veil()).not.toBeNull()

    custodian.reportPipelineOutcome(OK_COMMITTED)
    await flushCommit()

    expect(veil()).toBeNull()
    expect(custodian.registry.stateOf(DOCUMENT_SCOPE_ID)).toMatchObject(
      COMMITTED_DEFAULT
    )
  })
})

describe("createDocumentScopeCustodian — reportEnforcement", () => {
  it("a confirmed sheet commits through the same atomic-swap gate as a themed round", async () => {
    const custodian = registeredCustodian()

    custodian.reportEnforcement({ kind: "confirmed", swatchId: "default" })

    // Still veiled synchronously: the sheet paints under it first.
    expect(veil()).not.toBeNull()
    await flushCommit()
    expect(custodian.registry.stateOf(DOCUMENT_SCOPE_ID)).toMatchObject(
      COMMITTED_DEFAULT
    )
    expect(veil()).toBeNull()
  })

  it("a liveness timeout releases the veil onto the native page, with its own reason", () => {
    const custodian = registeredCustodian()

    custodian.reportEnforcement({ kind: "timeout" })

    expect(custodian.registry.stateOf(DOCUMENT_SCOPE_ID)).toMatchObject({
      kind: "EXONERATED_NATIVE",
      proof: { reason: "enforcement-timeout" },
    })
    expect(isPrepaintActive()).toBe(false)
  })

  it("shares the idempotency cache with pipeline rounds — a repeat confirm does not re-drive the hold", async () => {
    const custodian = registeredCustodian()
    custodian.reportEnforcement({ kind: "confirmed", swatchId: "default" })
    await flushCommit()
    const committed = custodian.registry.stateOf(DOCUMENT_SCOPE_ID)

    custodian.reportEnforcement({ kind: "confirmed", swatchId: "default" })

    expect(custodian.registry.stateOf(DOCUMENT_SCOPE_ID)).toBe(committed)
    expect(veil()).toBeNull()
  })
})
