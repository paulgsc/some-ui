import {
  createScopeRegistry,
  IllegalTransitionError,
  transition,
  type CommittedRealization,
  type CustodyPrimitive,
  type RestingScopeState,
  type ScopeEvent,
  type ScopeRef,
} from "@filter/adapter/scope-registry"
import { describe, expect, it, vi } from "vitest"

const CONTENT_EPOCH_0 = 0
const CONTENT_EPOCH_1 = 1
const EPOCH = { content: CONTENT_EPOCH_0, scope: 0 }

function fakeHold(log: Array<string> = [], name = "hold"): CustodyPrimitive {
  return {
    install: vi.fn(() => log.push(`${name}.install`)),
    release: vi.fn(() => log.push(`${name}.release`)),
  }
}

function fakeRealization<Rho>(
  revision: Rho,
  log: Array<string> = [],
  name = "realization",
  onInstall?: () => void | Promise<void>
): CommittedRealization<Rho> {
  return {
    revision,
    install: vi.fn(async () => {
      await onInstall?.()
      log.push(`${name}.install`)
    }),
    uninstall: vi.fn(() => log.push(`${name}.uninstall`)),
  }
}

const REF: ScopeRef = document

// ── transition(): Definition D.5's legal transitions, pure ────────────────

describe("transition — legal moves", () => {
  it("register: unregistered -> HELD(ε)", () => {
    const next = transition(undefined, { kind: "register", epoch: EPOCH })
    expect(next).toEqual({ kind: "HELD", epoch: EPOCH })
  })

  it("start-resolving: HELD(ε) -> RESOLVING(ε)", () => {
    const held: RestingScopeState = { kind: "HELD", epoch: EPOCH }
    expect(transition(held, { kind: "start-resolving" })).toEqual({
      kind: "RESOLVING",
      epoch: EPOCH,
    })
  })

  it("resolve-committed: RESOLVING(ε) -> COMMITTED(ε, ρ)", () => {
    const resolving: RestingScopeState<string> = {
      kind: "RESOLVING",
      epoch: EPOCH,
    }
    expect(
      transition(resolving, { kind: "resolve-committed", revision: "rev-1" })
    ).toEqual({ kind: "COMMITTED", epoch: EPOCH, revision: "rev-1" })
  })

  it("resolve-exonerated: RESOLVING(ε) -> EXONERATED_NATIVE(ε, π)", () => {
    const resolving: RestingScopeState<unknown, string> = {
      kind: "RESOLVING",
      epoch: EPOCH,
    }
    expect(
      transition(resolving, { kind: "resolve-exonerated", proof: "proof-1" })
    ).toEqual({ kind: "EXONERATED_NATIVE", epoch: EPOCH, proof: "proof-1" })
  })

  it("resolve-failed: RESOLVING(ε) -> FAILED_HELD(ε, reason) — conservative, not an exoneration", () => {
    const resolving: RestingScopeState = { kind: "RESOLVING", epoch: EPOCH }
    expect(
      transition(resolving, { kind: "resolve-failed", reason: "timeout" })
    ).toEqual({ kind: "FAILED_HELD", epoch: EPOCH, reason: "timeout" })
  })

  it("retry: FAILED_HELD(ε, ·) -> RESOLVING(ε)", () => {
    const failed: RestingScopeState = {
      kind: "FAILED_HELD",
      epoch: EPOCH,
      reason: "timeout",
    }
    expect(transition(failed, { kind: "retry" })).toEqual({
      kind: "RESOLVING",
      epoch: EPOCH,
    })
  })

  it("re-register: forces HELD(ε') with a bumped scope epoch, from HELD/RESOLVING/FAILED_HELD/COMMITTED/EXONERATED_NATIVE", () => {
    const sources: ReadonlyArray<RestingScopeState<string, string>> = [
      { kind: "HELD", epoch: EPOCH },
      { kind: "RESOLVING", epoch: EPOCH },
      { kind: "FAILED_HELD", epoch: EPOCH, reason: "x" },
      { kind: "COMMITTED", epoch: EPOCH, revision: "rev" },
      { kind: "EXONERATED_NATIVE", epoch: EPOCH, proof: "proof" },
    ]
    for (const source of sources) {
      const next = transition(source, {
        kind: "re-register",
        contentEpoch: CONTENT_EPOCH_1,
      })
      expect(next).toEqual({
        kind: "HELD",
        epoch: { content: CONTENT_EPOCH_1, scope: EPOCH.scope + 1 },
      })
    }
  })

  it("re-register: illegal from RETIRED (absorbing) and from unregistered", () => {
    const retired: RestingScopeState = { kind: "RETIRED" }
    expect(() =>
      transition(retired, {
        kind: "re-register",
        contentEpoch: CONTENT_EPOCH_1,
      })
    ).toThrow(IllegalTransitionError)
    expect(() =>
      transition(undefined, {
        kind: "re-register",
        contentEpoch: CONTENT_EPOCH_1,
      })
    ).toThrow(IllegalTransitionError)
  })

  it("invalidate: COMMITTED(ε, ρ) -> RESOLVING(ε) — never a silent re-exoneration", () => {
    const committed: RestingScopeState<string> = {
      kind: "COMMITTED",
      epoch: EPOCH,
      revision: "rev",
    }
    expect(transition(committed, { kind: "invalidate" })).toEqual({
      kind: "RESOLVING",
      epoch: EPOCH,
    })
  })

  it("invalidate: EXONERATED_NATIVE(ε, π) -> HELD(ε) — distinct target from the COMMITTED case", () => {
    const exonerated: RestingScopeState<unknown, string> = {
      kind: "EXONERATED_NATIVE",
      epoch: EPOCH,
      proof: "proof",
    }
    expect(transition(exonerated, { kind: "invalidate" })).toEqual({
      kind: "HELD",
      epoch: EPOCH,
    })
  })

  it("retire: from any state, including idempotently from RETIRED", () => {
    const sources: ReadonlyArray<RestingScopeState> = [
      { kind: "HELD", epoch: EPOCH },
      { kind: "RESOLVING", epoch: EPOCH },
      { kind: "FAILED_HELD", epoch: EPOCH, reason: "x" },
      { kind: "RETIRED" },
    ]
    for (const source of sources) {
      expect(transition(source, { kind: "retire" })).toEqual({
        kind: "RETIRED",
      })
    }
  })
})

describe("transition — illegal moves throw IllegalTransitionError", () => {
  const illegalCases: ReadonlyArray<{
    readonly name: string
    readonly from: RestingScopeState<string, string> | undefined
    readonly event: ScopeEvent<string, string>
  }> = [
    {
      name: "register over an already-registered state",
      from: { kind: "HELD", epoch: EPOCH },
      event: { kind: "register", epoch: EPOCH },
    },
    {
      name: "start-resolving from RESOLVING",
      from: { kind: "RESOLVING", epoch: EPOCH },
      event: { kind: "start-resolving" },
    },
    {
      name: "start-resolving from unregistered",
      from: undefined,
      event: { kind: "start-resolving" },
    },
    {
      name: "retry from HELD",
      from: { kind: "HELD", epoch: EPOCH },
      event: { kind: "retry" },
    },
    {
      name: "resolve-committed from HELD",
      from: { kind: "HELD", epoch: EPOCH },
      event: { kind: "resolve-committed", revision: "rev" },
    },
    {
      name: "resolve-exonerated from FAILED_HELD",
      from: { kind: "FAILED_HELD", epoch: EPOCH, reason: "x" },
      event: { kind: "resolve-exonerated", proof: "p" },
    },
    {
      name: "resolve-failed from COMMITTED",
      from: { kind: "COMMITTED", epoch: EPOCH, revision: "rev" },
      event: { kind: "resolve-failed", reason: "x" },
    },
    {
      name: "invalidate from HELD",
      from: { kind: "HELD", epoch: EPOCH },
      event: { kind: "invalidate" },
    },
    {
      name: "invalidate from RESOLVING",
      from: { kind: "RESOLVING", epoch: EPOCH },
      event: { kind: "invalidate" },
    },
    {
      name: "invalidate from FAILED_HELD",
      from: { kind: "FAILED_HELD", epoch: EPOCH, reason: "x" },
      event: { kind: "invalidate" },
    },
    {
      name: "invalidate from RETIRED",
      from: { kind: "RETIRED" },
      event: { kind: "invalidate" },
    },
    {
      name: "invalidate from unregistered",
      from: undefined,
      event: { kind: "invalidate" },
    },
  ]

  for (const { name, from, event } of illegalCases) {
    it(name, () => {
      expect(() => transition(from, event)).toThrow(IllegalTransitionError)
    })
  }
})

// ── DISCOVERED_UNHELD unreachability ───────────────────────────────────────

describe("DISCOVERED_UNHELD is unreachable as a resting state", () => {
  it("is structurally impossible to construct via transition() — a type error, not an unexercised branch", () => {
    // @ts-expect-error — RestingScopeState (transition()'s only possible
    // return type) has no "DISCOVERED_UNHELD" member; this line is the
    // compile-time proof the acceptance criterion asks for, not merely a
    // runtime assertion no test happens to have contradicted.
    const impossible: RestingScopeState = { kind: "DISCOVERED_UNHELD" }
    expect(impossible).toBeDefined()
  })

  it("exhaustive reachability search from 'unregistered' never yields DISCOVERED_UNHELD, and the reachable set is exactly Σ's six resting kinds", () => {
    // Deduped by *kind*, not by exact state value: "re-register" is legal
    // from every non-RETIRED kind and always yields a fresh HELD value with
    // a bumped scope epoch (Definition D.5), so deduping by full state
    // value never converges — every visit produces a new, never-before-seen
    // epoch. Only the reachable *set of kinds* is the property this test
    // (and the acceptance criterion it proves) cares about; one canonical
    // representative state per kind is enough to keep exploring from.
    const seen = new Set<string>()
    const explored = new Set<string>()
    const representative = new Map<
      string,
      RestingScopeState<string, string> | undefined
    >()
    representative.set("unregistered", undefined)
    const worklist: Array<string> = ["unregistered"]

    const candidateEvents = (): ReadonlyArray<ScopeEvent<string, string>> => [
      { kind: "register", epoch: EPOCH },
      { kind: "start-resolving" },
      { kind: "retry" },
      { kind: "resolve-committed", revision: "rev" },
      { kind: "resolve-exonerated", proof: "proof" },
      { kind: "resolve-failed", reason: "reason" },
      { kind: "re-register", contentEpoch: CONTENT_EPOCH_1 },
      { kind: "invalidate" },
      { kind: "retire" },
    ]

    while (worklist.length > 0) {
      const key = worklist.pop()
      if (key === undefined || explored.has(key)) continue
      explored.add(key)
      const current = representative.get(key)
      if (current !== undefined) seen.add(current.kind)

      for (const event of candidateEvents()) {
        try {
          const next = transition(current, event)
          seen.add(next.kind)
          if (!representative.has(next.kind)) {
            representative.set(next.kind, next)
            worklist.push(next.kind)
          }
        } catch (error) {
          if (!(error instanceof IllegalTransitionError)) throw error
        }
      }
    }

    expect(seen.has("DISCOVERED_UNHELD")).toBe(false)
    expect(seen).toEqual(
      new Set([
        "HELD",
        "RESOLVING",
        "COMMITTED",
        "EXONERATED_NATIVE",
        "FAILED_HELD",
        "RETIRED",
      ])
    )
  })
})

// ── createScopeRegistry(): orchestration and side-effect ordering ─────────

describe("createScopeRegistry — register", () => {
  it("installs the hold synchronously before the scope reads as HELD", () => {
    const log: Array<string> = []
    const hold = fakeHold(log)
    const registry = createScopeRegistry()

    registry.register("s1", {
      ref: REF,
      parent: null,
      contentEpoch: CONTENT_EPOCH_0,
      hold,
    })

    expect(log).toEqual(["hold.install"])
    expect(registry.stateOf("s1")).toEqual({
      kind: "HELD",
      epoch: { content: 0, scope: 0 },
    })
  })

  it("rejects registering the same id twice", () => {
    const registry = createScopeRegistry()
    registry.register("s1", {
      ref: REF,
      parent: null,
      contentEpoch: 0,
      hold: fakeHold(),
    })
    expect(() =>
      registry.register("s1", {
        ref: REF,
        parent: null,
        contentEpoch: 0,
        hold: fakeHold(),
      })
    ).toThrow()
  })
})

describe("createScopeRegistry — resolveCommitted: the two-phase custody handoff", () => {
  it("installs the successor and confirms it before releasing the predecessor hold", async () => {
    const log: Array<string> = []
    const installMock = vi.fn(() => log.push("hold.install"))
    const releaseMock = vi.fn(() => log.push("hold.release"))
    const hold: CustodyPrimitive = {
      install: installMock,
      release: releaseMock,
    }
    const registry = createScopeRegistry<string>()
    registry.register("s1", { ref: REF, parent: null, contentEpoch: 0, hold })
    registry.startResolving("s1")

    let holdStillEngagedDuringInstall = false
    const realization = fakeRealization("rev-1", log, "realization", () => {
      holdStillEngagedDuringInstall =
        installMock.mock.calls.length === 1 &&
        releaseMock.mock.calls.length === 0
    })

    await registry.resolveCommitted("s1", realization)

    expect(holdStillEngagedDuringInstall).toBe(true)
    expect(log).toEqual(["hold.install", "realization.install", "hold.release"])
    expect(registry.stateOf("s1")).toEqual({
      kind: "COMMITTED",
      epoch: { content: 0, scope: 0 },
      revision: "rev-1",
    })
  })

  it("on a failed install, leaves the hold engaged and transitions to FAILED_HELD instead of COMMITTED", async () => {
    const log: Array<string> = []
    const hold = fakeHold(log)
    const registry = createScopeRegistry<string>()
    registry.register("s1", { ref: REF, parent: null, contentEpoch: 0, hold })
    registry.startResolving("s1")

    const realization: CommittedRealization<string> = {
      revision: "rev-1",
      install: vi.fn(() => {
        throw new Error("boom")
      }),
      uninstall: vi.fn(),
    }

    await registry.resolveCommitted("s1", realization)

    expect(hold.release).not.toHaveBeenCalled()
    expect(registry.stateOf("s1")).toEqual({
      kind: "FAILED_HELD",
      epoch: { content: 0, scope: 0 },
      reason: "boom",
    })
  })

  it("rejects resolveCommitted from a non-RESOLVING state", async () => {
    const registry = createScopeRegistry<string>()
    registry.register("s1", {
      ref: REF,
      parent: null,
      contentEpoch: 0,
      hold: fakeHold(),
    })
    await expect(
      registry.resolveCommitted("s1", fakeRealization("rev-1"))
    ).rejects.toThrow(IllegalTransitionError)
  })

  it("discards a stale completion superseded by a concurrent reRegister() during the install() await — never releases the newly re-installed hold, never overwrites the newer HELD state", async () => {
    const log: Array<string> = []
    const hold = fakeHold(log)
    const registry = createScopeRegistry<string>()
    registry.register("s1", { ref: REF, parent: null, contentEpoch: 0, hold })
    registry.startResolving("s1")

    let releaseInstall: (() => void) | undefined
    const installGate = new Promise<void>((resolve) => {
      releaseInstall = resolve
    })
    const realization: CommittedRealization<string> = {
      revision: "rev-1",
      install: vi.fn(async () => {
        await installGate
        log.push("realization.install")
      }),
      uninstall: vi.fn(() => log.push("realization.uninstall")),
    }

    const pending = registry.resolveCommitted("s1", realization)

    // Interleaves while resolveCommitted's install() await is suspended —
    // exactly the JS single-threaded interleaving the finding is about, no
    // real parallelism required.
    registry.reRegister("s1", CONTENT_EPOCH_1)
    log.length = 0

    releaseInstall?.()
    await pending

    // The stale completion must not have touched the hold reRegister()
    // already re-installed, nor overwritten reRegister()'s HELD(ε') with a
    // COMMITTED value belonging to the superseded round.
    expect(log).toEqual(["realization.install", "realization.uninstall"])
    expect(registry.stateOf("s1")).toEqual({
      kind: "HELD",
      epoch: { content: CONTENT_EPOCH_1, scope: 1 },
    })
  })

  it("discards a stale completion superseded by a concurrent retire() during the install() await", async () => {
    const log: Array<string> = []
    const hold = fakeHold(log)
    const registry = createScopeRegistry<string>()
    registry.register("s1", { ref: REF, parent: null, contentEpoch: 0, hold })
    registry.startResolving("s1")

    let releaseInstall: (() => void) | undefined
    const installGate = new Promise<void>((resolve) => {
      releaseInstall = resolve
    })
    const realization: CommittedRealization<string> = {
      revision: "rev-1",
      install: vi.fn(async () => {
        await installGate
        log.push("realization.install")
      }),
      uninstall: vi.fn(() => log.push("realization.uninstall")),
    }

    const pending = registry.resolveCommitted("s1", realization)

    registry.retire("s1")
    log.length = 0

    releaseInstall?.()
    await pending

    expect(log).toEqual(["realization.install", "realization.uninstall"])
    expect(registry.stateOf("s1")).toEqual({ kind: "RETIRED" })
  })
})

describe("createScopeRegistry — invalidate: rehold before teardown, in both directions", () => {
  it("COMMITTED -> RESOLVING: re-installs the hold before uninstalling the superseded realization", async () => {
    const log: Array<string> = []
    const hold = fakeHold(log)
    const registry = createScopeRegistry<string>()
    registry.register("s1", { ref: REF, parent: null, contentEpoch: 0, hold })
    registry.startResolving("s1")
    await registry.resolveCommitted("s1", fakeRealization("rev-1", log))
    log.length = 0

    registry.invalidate("s1")

    expect(log).toEqual(["hold.install", "realization.uninstall"])
    expect(registry.stateOf("s1")).toEqual({
      kind: "RESOLVING",
      epoch: { content: 0, scope: 0 },
    })
  })

  it("EXONERATED_NATIVE -> HELD: re-installs the hold, distinct target from the COMMITTED case", () => {
    const log: Array<string> = []
    const hold = fakeHold(log)
    const registry = createScopeRegistry<unknown, string>()
    registry.register("s1", { ref: REF, parent: null, contentEpoch: 0, hold })
    registry.startResolving("s1")
    registry.resolveExonerated("s1", { proof: "proof-1" })
    log.length = 0

    registry.invalidate("s1")

    expect(log).toEqual(["hold.install"])
    expect(registry.stateOf("s1")).toEqual({
      kind: "HELD",
      epoch: { content: 0, scope: 0 },
    })
  })
})

describe("createScopeRegistry — resolveExonerated", () => {
  it("writes EXONERATED_NATIVE and releases the hold", () => {
    const log: Array<string> = []
    const hold = fakeHold(log)
    const registry = createScopeRegistry<unknown, string>()
    registry.register("s1", { ref: REF, parent: null, contentEpoch: 0, hold })
    registry.startResolving("s1")

    registry.resolveExonerated("s1", { proof: "proof-1" })

    expect(log).toEqual(["hold.install", "hold.release"])
    expect(registry.stateOf("s1")).toEqual({
      kind: "EXONERATED_NATIVE",
      epoch: { content: 0, scope: 0 },
      proof: "proof-1",
    })
  })
})

describe("createScopeRegistry — reRegister: content-epoch rollover", () => {
  it("forces HELD(ε') and re-engages the hold, tearing down any prior committed realization after", async () => {
    const log: Array<string> = []
    const hold = fakeHold(log)
    const registry = createScopeRegistry<string>()
    registry.register("s1", { ref: REF, parent: null, contentEpoch: 0, hold })
    registry.startResolving("s1")
    await registry.resolveCommitted("s1", fakeRealization("rev-1", log))
    log.length = 0

    registry.reRegister("s1", CONTENT_EPOCH_1)

    expect(log).toEqual(["hold.install", "realization.uninstall"])
    expect(registry.stateOf("s1")).toEqual({
      kind: "HELD",
      epoch: { content: CONTENT_EPOCH_1, scope: 1 },
    })
  })

  it("rejects re-registering a RETIRED scope", () => {
    const registry = createScopeRegistry()
    registry.register("s1", {
      ref: REF,
      parent: null,
      contentEpoch: 0,
      hold: fakeHold(),
    })
    registry.retire("s1")
    expect(() => registry.reRegister("s1", CONTENT_EPOCH_1)).toThrow(
      IllegalTransitionError
    )
  })
})

describe("createScopeRegistry — retire", () => {
  it("releases the hold and tears down a committed realization, then is idempotent", async () => {
    const log: Array<string> = []
    const hold = fakeHold(log)
    const registry = createScopeRegistry<string>()
    registry.register("s1", { ref: REF, parent: null, contentEpoch: 0, hold })
    registry.startResolving("s1")
    await registry.resolveCommitted("s1", fakeRealization("rev-1", log))
    log.length = 0

    registry.retire("s1")
    expect(log).toEqual(["realization.uninstall", "hold.release"])
    expect(registry.stateOf("s1")).toEqual({ kind: "RETIRED" })

    log.length = 0
    registry.retire("s1")
    expect(log).toEqual([])
  })
})

describe("createScopeRegistry — kernel independence (Remark D.3, Theorem D.2)", () => {
  it("against the null adapter (no CommittedRealization/NativeExoneration ever constructed), every registered scope stays in {HELD, RESOLVING, FAILED_HELD}", () => {
    const registry = createScopeRegistry<never, never>()
    registry.register("s1", {
      ref: REF,
      parent: null,
      contentEpoch: 0,
      hold: fakeHold(),
    })
    expect(registry.stateOf("s1")?.kind).toBe("HELD")

    registry.startResolving("s1")
    expect(registry.stateOf("s1")?.kind).toBe("RESOLVING")

    registry.resolveFailed("s1", "no policy installed")
    expect(registry.stateOf("s1")?.kind).toBe("FAILED_HELD")

    registry.retry("s1")
    expect(registry.stateOf("s1")?.kind).toBe("RESOLVING")

    registry.reRegister("s1", CONTENT_EPOCH_1)
    expect(registry.stateOf("s1")?.kind).toBe("HELD")
  })
})
