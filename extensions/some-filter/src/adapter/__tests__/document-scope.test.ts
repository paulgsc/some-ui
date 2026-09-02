import {
  createDocumentScopeCustodian,
  createPrepaintCustody,
  DOCUMENT_SCOPE_ID,
  type FireOutcome,
} from "@filter/adapter/document-scope"
import { createScopeRegistry } from "@filter/adapter/scope-registry"
import {
  isPrepaintActive,
  PREPAINT_VEIL_ID,
} from "@filter/lib/content/prepaint"
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  document.getElementById(PREPAINT_VEIL_ID)?.remove()
  document.documentElement.classList.remove("sw-dirty")
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

// Advances past the double-rAF awaitAtomicSwap() waits on (vitest.setup.ts
// stubs rAF synchronous, so the gate's own promise resolves eagerly) and
// drains the microtask queue that resolveCommitted()'s `await` still needs —
// a real macrotask boundary guarantees every pending microtask has run.
async function flushCommit(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("createDocumentScopeCustodian — registration (Corollary D.1.1)", () => {
  it("registers the document HELD via a real prepaint custody, engaging the existing veil", () => {
    const custodian = createDocumentScopeCustodian()
    custodian.registerDocument(0)

    expect(custodian.registry.stateOf(DOCUMENT_SCOPE_ID)?.kind).toBe("HELD")
    expect(isPrepaintActive()).toBe(true)
    expect(document.getElementById(PREPAINT_VEIL_ID)).not.toBeNull()
  })

  it("is idempotent — a second call does not re-register or throw", () => {
    const custodian = createDocumentScopeCustodian()
    custodian.registerDocument(0)
    expect(() => custodian.registerDocument(0)).not.toThrow()
    expect(custodian.registry.ids()).toEqual([DOCUMENT_SCOPE_ID])
  })
})

describe("createDocumentScopeCustodian — the fail-open gap (#1266)", () => {
  it("a thrown decide()/realize() produces FAILED_HELD and the real veil stays up", () => {
    const custodian = createDocumentScopeCustodian()
    custodian.registerDocument(0)
    expect(document.getElementById(PREPAINT_VEIL_ID)).not.toBeNull()

    custodian.reportPipelineOutcome(ERROR_OUTCOME)

    expect(custodian.registry.stateOf(DOCUMENT_SCOPE_ID)).toEqual({
      kind: "FAILED_HELD",
      epoch: { content: 0, scope: 0 },
      reason: "decide() threw",
    })
    // The actual DOM veil — not just the registry's belief — is still there.
    expect(isPrepaintActive()).toBe(true)
    expect(document.getElementById(PREPAINT_VEIL_ID)).not.toBeNull()
  })

  it("a genuine restore-native verdict, by contrast, releases the veil immediately", () => {
    const custodian = createDocumentScopeCustodian()
    custodian.registerDocument(0)

    custodian.reportPipelineOutcome(OK_RESTORE_NATIVE)

    expect(custodian.registry.stateOf(DOCUMENT_SCOPE_ID)?.kind).toBe(
      "EXONERATED_NATIVE"
    )
    expect(isPrepaintActive()).toBe(false)
    expect(document.getElementById(PREPAINT_VEIL_ID)).toBeNull()
  })

  it("a committed theme releases the veil only after the atomic-swap gate settles", async () => {
    const custodian = createDocumentScopeCustodian()
    custodian.registerDocument(0)

    custodian.reportPipelineOutcome(OK_COMMITTED)

    // resolveCommitted() is async even when rAF is stubbed synchronous —
    // the veil must still be up synchronously right after the call.
    expect(document.getElementById(PREPAINT_VEIL_ID)).not.toBeNull()

    await flushCommit()

    expect(custodian.registry.stateOf(DOCUMENT_SCOPE_ID)).toMatchObject({
      kind: "COMMITTED",
      revision: "default",
    })
    expect(document.getElementById(PREPAINT_VEIL_ID)).toBeNull()
  })
})

describe("createDocumentScopeCustodian — idempotent routing (#831-class guard)", () => {
  it("an unchanged verdict on a later fire does not re-touch the hold", async () => {
    const hold = { install: vi.fn(), release: vi.fn() }
    const registry = createScopeRegistry<string, { reason: string }>()
    const custodian = createDocumentScopeCustodian(registry)
    registry.register(DOCUMENT_SCOPE_ID, {
      ref: document,
      parent: null,
      contentEpoch: 0,
      hold,
    })
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
    const hold = { install: vi.fn(), release: vi.fn() }
    const registry = createScopeRegistry<string, { reason: string }>()
    const custodian = createDocumentScopeCustodian(registry)
    registry.register(DOCUMENT_SCOPE_ID, {
      ref: document,
      parent: null,
      contentEpoch: 0,
      hold,
    })

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
    const custodian = createDocumentScopeCustodian()
    custodian.registerDocument(0)

    custodian.reportPipelineOutcome(ERROR_OUTCOME)
    expect(() => custodian.reportPipelineOutcome(ERROR_OUTCOME)).not.toThrow()

    expect(custodian.registry.stateOf(DOCUMENT_SCOPE_ID)?.kind).toBe(
      "FAILED_HELD"
    )
  })

  it("forgetLastOutcome() makes an unchanged-looking verdict re-release a hold re-armed behind the custodian's back (yt-navigate-start/finish)", async () => {
    // Regression for the exact yt-navigate-repaint.spec.ts failure this
    // fix was written against: nav-start re-arms the veil through
    // hold.install() directly (content.ts calls enablePrepaint(), not this
    // custodian), then nav-finish's rescan reports the *same* committed
    // verdict as before. Without forgetLastOutcome(), that "unchanged"
    // signature would short-circuit and the just-re-armed hold would never
    // be released again.
    const hold = { install: vi.fn(), release: vi.fn() }
    const registry = createScopeRegistry<string, { reason: string }>()
    const custodian = createDocumentScopeCustodian(registry)
    registry.register(DOCUMENT_SCOPE_ID, {
      ref: document,
      parent: null,
      contentEpoch: 0,
      hold,
    })

    custodian.reportPipelineOutcome(OK_COMMITTED)
    await flushCommit()
    expect(hold.release).toHaveBeenCalledTimes(1)

    // yt-navigate-start's own direct enablePrepaint() call, simulated here
    // as a direct hold.install() — outside the custodian entirely.
    hold.install()
    custodian.forgetLastOutcome()

    // yt-navigate-finish's rescan reports the identical verdict.
    custodian.reportPipelineOutcome(OK_COMMITTED)
    await flushCommit()

    expect(hold.release).toHaveBeenCalledTimes(2)
    expect(registry.stateOf(DOCUMENT_SCOPE_ID)).toMatchObject({
      kind: "COMMITTED",
      revision: "default",
    })
  })

  it("without forgetLastOutcome(), the same scenario would wrongly leave the hold released only once (documents the bug this method fixes)", async () => {
    const hold = { install: vi.fn(), release: vi.fn() }
    const registry = createScopeRegistry<string, { reason: string }>()
    const custodian = createDocumentScopeCustodian(registry)
    registry.register(DOCUMENT_SCOPE_ID, {
      ref: document,
      parent: null,
      contentEpoch: 0,
      hold,
    })

    custodian.reportPipelineOutcome(OK_COMMITTED)
    await flushCommit()

    hold.install() // external re-arm, custodian not told
    custodian.reportPipelineOutcome(OK_COMMITTED) // identical signature — skipped
    await flushCommit()

    expect(hold.release).toHaveBeenCalledTimes(1)
  })
})

describe("createDocumentScopeCustodian — no-swatch verdict", () => {
  it("an empty actions array (swatch === null) also exonerates, not fails", () => {
    const custodian = createDocumentScopeCustodian()
    custodian.registerDocument(0)

    custodian.reportPipelineOutcome(OK_NO_SWATCH)

    expect(custodian.registry.stateOf(DOCUMENT_SCOPE_ID)).toMatchObject({
      kind: "EXONERATED_NATIVE",
      proof: { reason: "no-swatch" },
    })
  })
})

describe("createPrepaintCustody", () => {
  it("install()/release() are the real enablePrepaint()/disablePrepaint() — not a second veil", () => {
    const custody = createPrepaintCustody()
    custody.install()
    expect(document.querySelectorAll(`#${PREPAINT_VEIL_ID}`)).toHaveLength(1)
    custody.release()
    expect(document.getElementById(PREPAINT_VEIL_ID)).toBeNull()
  })
})
