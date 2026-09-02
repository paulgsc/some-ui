/**
 * The rendering-scope registry and custody state machine — canon §D.2,
 * Definition D.4 (rendering-scope lifetime `L_R`) and Definition D.5 (the
 * scope registry `κ`, its state space `Σ`, and the custody state machine).
 * SF-RG (#1265), part of the SF-SCOPE epic (#1263).
 *
 * This module is deliberately additive and self-contained: nothing here is
 * wired into `content.ts`, `pipeline.ts`, or any real page (that is SF-BS's
 * and SF-DC's job). It has no import of, and no reference to, any concrete
 * theme adapter — `theme-adapter.ts`, `swatches/`, or any color concept —
 * satisfying Theorem D.2's kernel-independence requirement and its litmus
 * test, Corollary D.2.1: this file must build and its own test suite must
 * pass with nothing standing in for a "committed realization" but an inert
 * stub, exactly the null-adapter shape Remark D.3 describes for the scope
 * registry ("every registered scope remains permanently in {HELD, RESOLVING,
 * FAILED_HELD}"). The one type this module imports from outside itself is
 * `Epoch` from `@some-extension/transport`'s own kernel — the neutral
 * content-epoch counter Definition 5.4 already defines, not an adapter — and
 * that import is `import type`, erased at compile time, so a standalone
 * (non-bundled) injection of this file's compiled output carries no runtime
 * module dependency at all (`tests/e2e/fixtures/scope-registry-harness.ts`
 * relies on exactly this to run the module live in a browser page with no
 * extension wiring).
 *
 * The policy revision `Rho` and native-safety proof witness `Pi` that
 * Definition D.5's `COMMITTED`/`EXONERATED_NATIVE` states carry are left as
 * generic type parameters rather than concrete types — this registry names
 * neither, per Remark D.3 ("Definition D.5's state machine is defined purely
 * over Σ... it names neither Φ nor a concrete decide").
 *
 * Two layers:
 *   - `transition()`: Definition D.5's legal transitions as a pure function
 *     of `(currentState, event) → nextState`, unit-testable without a DOM.
 *     Its own type signature is the proof that `DISCOVERED_UNHELD` is
 *     unreachable as a resting value (see that type's own doc comment) —
 *     not merely a claim no test happens to exercise.
 *   - `createScopeRegistry()`: the stateful registry `κ`, wrapping
 *     `transition()` with the real side effects (installing/releasing a
 *     `CustodyPrimitive`, installing/uninstalling a `CommittedRealization`)
 *     in the order Theorem D.3's persistence proof actually requires — most
 *     importantly, the two-phase custody handoff: a successor is installed
 *     and confirmed *before* the predecessor is released, in both
 *     directions (committing, and reholding on invalidation).
 */

/** Definition 5.4 (Epoch) — canon §5.4. Type-only: erased at compile time, so this module carries no runtime dependency on `@some-extension/transport`. */
import type { Epoch } from "@some-extension/transport/session/epoch"

/** Definition D.5's scope epoch `ε = (ε_content, ε_scope)`. `scope` advances only on this scope's own registration or re-registration. */
export type ScopeEpoch = {
  readonly content: Epoch
  readonly scope: number
}

export type ScopeId = string

/** Definition D.4: a rendering scope is the root document, or an open shadow root. The DOM reference a `CustodyPrimitive` needs to realize a hold. */
export type ScopeRef = Document | ShadowRoot

// ── Definition D.5's state space Σ ──────────────────────────────────────────

export type HeldState = {
  readonly kind: "HELD"
  readonly epoch: ScopeEpoch
}

export type ResolvingState = {
  readonly kind: "RESOLVING"
  readonly epoch: ScopeEpoch
}

export type CommittedState<Rho> = {
  readonly kind: "COMMITTED"
  readonly epoch: ScopeEpoch
  readonly revision: Rho
}

export type ExoneratedNativeState<Pi> = {
  readonly kind: "EXONERATED_NATIVE"
  readonly epoch: ScopeEpoch
  readonly proof: Pi
}

export type FailedHeldState = {
  readonly kind: "FAILED_HELD"
  readonly epoch: ScopeEpoch
  readonly reason: string
}

export type RetiredState = {
  readonly kind: "RETIRED"
}

/**
 * The states Definition D.5 permits `κ_t` to actually hold. `transition()`
 * below is typed to take and return only this union — `DISCOVERED_UNHELD` is
 * not a member of it, by construction, not by omission. See
 * `RestingScopeState`'s sibling doc on `DiscoveredUnheldStateKind` for why
 * that is the unreachability proof the issue's acceptance criteria asks for.
 */
export type RestingScopeState<Rho = unknown, Pi = unknown> =
  | HeldState
  | ResolvingState
  | CommittedState<Rho>
  | ExoneratedNativeState<Pi>
  | FailedHeldState
  | RetiredState

/**
 * `Σ`'s seventh member, listed in Definition D.5 "solely so a
 * coverage-observability instrument (§8.3, SF-OB) can assert its occupancy
 * count is always zero; a conforming custodian must never construct it as a
 * resting value of κ_t." This registry represents "not yet registered" as
 * the *absence* of a record (`undefined`/not in the map) rather than as a
 * stored value of this kind — so nothing in this module ever constructs one.
 * `RestingScopeState` above (what `transition()` and every `ScopeRecord`
 * actually traffic in) has no variant of this shape at all: the TypeScript
 * type checker itself refuses a `RestingScopeState` value with this kind,
 * which is what makes "unreachable" a property of the code rather than a
 * fact about which tests happen to have been written. Exported only for
 * §8.3/SF-OB's future coverage-reporting contract, and for this module's own
 * unreachability test to name the forbidden kind it is asserting against.
 */
export type DiscoveredUnheldStateKind = "DISCOVERED_UNHELD"

export type ScopeStateKind =
  | RestingScopeState["kind"]
  | DiscoveredUnheldStateKind

// ── Legal transitions (Definition D.5, "Legal transitions") ────────────────

export type RegisterEvent = {
  readonly kind: "register"
  readonly epoch: ScopeEpoch
}

/** Onset of classification: `HELD(ε) -> RESOLVING(ε)`. */
export type StartResolvingEvent = {
  readonly kind: "start-resolving"
}

export type ResolveCommittedEvent<Rho> = {
  readonly kind: "resolve-committed"
  readonly revision: Rho
}

export type ResolveExoneratedEvent<Pi> = {
  readonly kind: "resolve-exonerated"
  readonly proof: Pi
}

/** Conservative, not an exoneration: `RESOLVING(ε) -> FAILED_HELD(ε, reason)`. */
export type ResolveFailedEvent = {
  readonly kind: "resolve-failed"
  readonly reason: string
}

/** `FAILED_HELD(ε, ·) -> RESOLVING(ε)`. */
export type RetryEvent = {
  readonly kind: "retry"
}

/**
 * Forced on every scope still live immediately after a content-epoch
 * rollover: `κ_t(r) -> HELD(ε')` with `ε' = (ε_content', ε_scope + 1)`, from
 * any non-`RETIRED` state.
 */
export type ReRegisterEvent = {
  readonly kind: "re-register"
  readonly contentEpoch: Epoch
}

/**
 * Rehold on invalidation. Definition D.5 gives this event *two different
 * targets* depending on the current state — never a silent re-exoneration,
 * and never a round spent under a stale `ρ`/`π`:
 *   - `COMMITTED(ε, ρ) -> RESOLVING(ε)`, forced the moment `ρ` is superseded.
 *   - `EXONERATED_NATIVE(ε, π) -> HELD(ε)`, forced the moment `π` is
 *     invalidated.
 * Illegal from `HELD`/`RESOLVING`/`FAILED_HELD`/`RETIRED` — there is no `ρ`
 * or `π` standing to invalidate.
 */
export type InvalidateEvent = {
  readonly kind: "invalidate"
}

/** From any state (idempotent from `RETIRED`), on detachment or `L_R(r)` ending. `RETIRED` is absorbing. */
export type RetireEvent = {
  readonly kind: "retire"
}

export type ScopeEvent<Rho = unknown, Pi = unknown> =
  | RegisterEvent
  | StartResolvingEvent
  | ResolveCommittedEvent<Rho>
  | ResolveExoneratedEvent<Pi>
  | ResolveFailedEvent
  | RetryEvent
  | ReRegisterEvent
  | InvalidateEvent
  | RetireEvent

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: RestingScopeState["kind"] | "unregistered",
    public readonly event: ScopeEvent["kind"]
  ) {
    super(
      `[scope-registry] illegal transition: ${event} from ${from} (Definition D.5)`
    )
    this.name = "IllegalTransitionError"
  }
}

/**
 * Definition D.5's legal transitions, as a pure function. `current` is
 * `undefined` for a scope that is live (Definition D.4: `r ∈ R_t`) but not
 * yet registered — the *only* representation this module has for "not yet
 * registered," precisely so a real `DISCOVERED_UNHELD` value is never
 * constructed anywhere (see `DiscoveredUnheldStateKind`'s doc comment).
 *
 * Throws `IllegalTransitionError` for any `(current, event)` pair Definition
 * D.5 does not name — a conforming caller (this module's own
 * `createScopeRegistry()` included) never reaches one; the throw exists so a
 * caller bug fails loudly rather than silently accepting an unsound state.
 */
export function transition<Rho = unknown, Pi = unknown>(
  current: RestingScopeState<Rho, Pi> | undefined,
  event: ScopeEvent<Rho, Pi>
): RestingScopeState<Rho, Pi> {
  const from = current?.kind ?? "unregistered"

  switch (event.kind) {
    case "register": {
      if (current !== undefined)
        throw new IllegalTransitionError(from, event.kind)
      return { kind: "HELD", epoch: event.epoch }
    }

    case "start-resolving": {
      if (current?.kind !== "HELD")
        throw new IllegalTransitionError(from, event.kind)
      return { kind: "RESOLVING", epoch: current.epoch }
    }

    case "retry": {
      if (current?.kind !== "FAILED_HELD")
        throw new IllegalTransitionError(from, event.kind)
      return { kind: "RESOLVING", epoch: current.epoch }
    }

    case "resolve-committed": {
      if (current?.kind !== "RESOLVING")
        throw new IllegalTransitionError(from, event.kind)
      return {
        kind: "COMMITTED",
        epoch: current.epoch,
        revision: event.revision,
      }
    }

    case "resolve-exonerated": {
      if (current?.kind !== "RESOLVING")
        throw new IllegalTransitionError(from, event.kind)
      return {
        kind: "EXONERATED_NATIVE",
        epoch: current.epoch,
        proof: event.proof,
      }
    }

    case "resolve-failed": {
      if (current?.kind !== "RESOLVING")
        throw new IllegalTransitionError(from, event.kind)
      return { kind: "FAILED_HELD", epoch: current.epoch, reason: event.reason }
    }

    case "re-register": {
      if (current === undefined || current.kind === "RETIRED") {
        throw new IllegalTransitionError(from, event.kind)
      }
      return {
        kind: "HELD",
        epoch: { content: event.contentEpoch, scope: current.epoch.scope + 1 },
      }
    }

    case "invalidate": {
      if (current?.kind === "COMMITTED") {
        return { kind: "RESOLVING", epoch: current.epoch }
      }
      if (current?.kind === "EXONERATED_NATIVE") {
        return { kind: "HELD", epoch: current.epoch }
      }
      throw new IllegalTransitionError(from, event.kind)
    }

    case "retire": {
      return { kind: "RETIRED" }
    }

    default: {
      const exhaustive: never = event
      throw new Error(
        `[scope-registry] unhandled event: ${JSON.stringify(exhaustive)}`
      )
    }
  }
}

// ── Side-effect contracts (driver-supplied, not this module's concern) ─────

/**
 * The conservative-presentation mechanism realizing a
 * `HELD`/`RESOLVING`/`FAILED_HELD` scope (Definition D.5's first `Safe_T`
 * disjunct) — `custody-primitive.ts`'s `createOcclusionHold` is this
 * module's own production implementation, boundary-crossing by construction
 * (see that file). `install`/`release` must both be idempotent — the
 * registry below calls `install()` on every transition that requires the
 * hold engaged, including ones where it may already be.
 */
export type CustodyPrimitive = {
  install(): void
  release(): void
}

/**
 * The generic shape of a *committed* realization — this story defines the
 * shape, never the dark swatch itself (out of scope; SF-AD's job). `install`
 * may be asynchronous (confirming a real theme's realization can require
 * waiting on more than a synchronous DOM write); `uninstall` never is, since
 * reholding on invalidation must be able to complete within the same round
 * it is triggered (Definition D.5's instantaneity requirement).
 */
export type CommittedRealization<Rho> = {
  readonly revision: Rho
  install(): void | Promise<void>
  uninstall(): void
}

/** `π`: a native-safety proof witness. Purely a data witness — unlike a committed realization, an exoneration is a claim about the vendor's own DOM, not something this registry installs or tears down. */
export type NativeExoneration<Pi> = {
  readonly proof: Pi
}

export type ScopeRegistration = {
  readonly ref: ScopeRef
  /** `anc(r)`, Definition D.4. `null` for the root scope `r_0`. */
  readonly parent: ScopeId | null
  readonly contentEpoch: Epoch
  readonly hold: CustodyPrimitive
}

export type ScopeSnapshot<Rho = unknown, Pi = unknown> = {
  readonly id: ScopeId
  readonly ref: ScopeRef
  readonly parent: ScopeId | null
  readonly state: RestingScopeState<Rho, Pi>
}

type ScopeRecord<Rho, Pi> = {
  readonly ref: ScopeRef
  readonly parent: ScopeId | null
  readonly hold: CustodyPrimitive
  state: RestingScopeState<Rho, Pi>
  committedRealization: CommittedRealization<Rho> | null
  /**
   * Bumped by every synchronous state mutation this registry makes to this
   * record. `resolveCommitted`'s `await realization.install()` is the one
   * place execution is suspended mid-transition — a concurrent `reRegister`/
   * `retire`/`invalidate` call (legal, from JS's ordinary single-threaded
   * interleaving: nothing blocks another call on the same id while an
   * `await` elsewhere is suspended) can complete an entire transition in
   * that gap. Capturing this before the await and comparing it after is how
   * `resolveCommitted` tells "nothing else touched this scope while I was
   * waiting" from "it did," so a stale completion never clobbers a newer,
   * already-established state.
   */
  generation: number
}

export type ScopeRegistry<Rho = unknown, Pi = unknown> = {
  /**
   * Registration is instantaneous (Definition D.5): `hold.install()` runs
   * synchronously, before this call returns, so there is no round in which
   * this scope is in the registry without its custody primitive engaged.
   */
  register(id: ScopeId, registration: ScopeRegistration): void

  /** `HELD(ε) -> RESOLVING(ε)`. */
  startResolving(id: ScopeId): void

  /** `FAILED_HELD(ε, ·) -> RESOLVING(ε)`. */
  retry(id: ScopeId): void

  /** `RESOLVING(ε) -> FAILED_HELD(ε, reason)`. The hold remains engaged throughout — conservative, not an exoneration. */
  resolveFailed(id: ScopeId, reason: string): void

  /** `RESOLVING(ε) -> EXONERATED_NATIVE(ε, π)`. The hold is released only once `κ` already reflects the exoneration (no successor artifact to install first — see `NativeExoneration`'s own doc comment). */
  resolveExonerated(id: ScopeId, exoneration: NativeExoneration<Pi>): void

  /**
   * The two-phase custody handoff (Theorem D.3): `realization.install()` is
   * awaited and confirmed *before* the scope's hold is released, and `κ` is
   * written to `COMMITTED` only after both have happened — so at no round is
   * the scope covered by neither. If `install()` throws or rejects, the hold
   * is left engaged and the scope instead transitions to `FAILED_HELD`
   * (conservative default, Axiom C.1), never to `COMMITTED`.
   */
  resolveCommitted(
    id: ScopeId,
    realization: CommittedRealization<Rho>
  ): Promise<void>

  /**
   * Rehold on invalidation, in *both* directions Definition D.5 names. The
   * same two-phase discipline applies in reverse: the hold is re-installed
   * and confirmed before the superseded committed realization (if any) is
   * torn down, so a `COMMITTED` scope's `RESOLVING` reopening never has a
   * round covered by neither.
   */
  invalidate(id: ScopeId): void

  /**
   * Forced on every non-`RETIRED` scope on a content-epoch rollover. Tears
   * down whatever successor artifact the prior state had (a committed
   * realization) and (re-)engages the hold before writing the new `HELD(ε')`
   * — this scope was never actually left uncovered, even though its `κ`
   * value changes.
   */
  reRegister(id: ScopeId, contentEpoch: Epoch): void

  /** From any state; idempotent if already `RETIRED`. Releases the hold and any committed realization — Definition D.5's fourth `Safe_T` disjunct (`RETIRED` is vacuous) means neither needs to remain. */
  retire(id: ScopeId): void

  stateOf(id: ScopeId): RestingScopeState<Rho, Pi> | undefined
  isRegistered(id: ScopeId): boolean
  ids(): ReadonlyArray<ScopeId>
  snapshot(id: ScopeId): ScopeSnapshot<Rho, Pi> | undefined
}

function record<Rho, Pi>(
  records: Map<ScopeId, ScopeRecord<Rho, Pi>>,
  id: ScopeId
): ScopeRecord<Rho, Pi> {
  const found = records.get(id)
  if (found === undefined) {
    throw new Error(`[scope-registry] no such scope: ${id}`)
  }
  return found
}

/** Applies a transition and bumps the record's generation in one place, so every synchronous mutation this registry makes is visible to `resolveCommitted`'s staleness check. */
function transitionRecord<Rho, Pi>(
  r: ScopeRecord<Rho, Pi>,
  event: ScopeEvent<Rho, Pi>
): void {
  r.state = transition<Rho, Pi>(r.state, event)
  r.generation += 1
}

export function createScopeRegistry<
  Rho = unknown,
  Pi = unknown,
>(): ScopeRegistry<Rho, Pi> {
  const records = new Map<ScopeId, ScopeRecord<Rho, Pi>>()

  return {
    register(id, registration): void {
      if (records.has(id)) {
        throw new Error(`[scope-registry] scope already registered: ${id}`)
      }
      const epoch: ScopeEpoch = { content: registration.contentEpoch, scope: 0 }
      registration.hold.install()
      records.set(id, {
        ref: registration.ref,
        parent: registration.parent,
        hold: registration.hold,
        state: transition<Rho, Pi>(undefined, { kind: "register", epoch }),
        committedRealization: null,
        generation: 0,
      })
    },

    startResolving(id): void {
      transitionRecord(record(records, id), { kind: "start-resolving" })
    },

    retry(id): void {
      transitionRecord(record(records, id), { kind: "retry" })
    },

    resolveFailed(id, reason): void {
      transitionRecord(record(records, id), { kind: "resolve-failed", reason })
    },

    resolveExonerated(id, exoneration): void {
      const r = record(records, id)
      transitionRecord(r, {
        kind: "resolve-exonerated",
        proof: exoneration.proof,
      })
      r.hold.release()
    },

    async resolveCommitted(id, realization): Promise<void> {
      const r = record(records, id)
      if (r.state.kind !== "RESOLVING") {
        throw new IllegalTransitionError(r.state.kind, "resolve-committed")
      }
      const generationAtStart = r.generation

      let installError: unknown
      try {
        await realization.install()
      } catch (error) {
        installError = error
      }

      // A concurrent reRegister()/retire()/invalidate() on this same id can
      // run to completion while the await above was suspended (see
      // ScopeRecord.generation's own doc comment) — that call has already
      // established whatever κ-value and hold/realization state is now
      // current, and this stale completion must not clobber it: uninstall
      // the now-orphaned realization (if it did install) and stop, touching
      // neither the hold nor κ.
      if (r.generation !== generationAtStart) {
        if (installError === undefined) {
          realization.uninstall()
        }
        return
      }

      if (installError !== undefined) {
        transitionRecord(r, {
          kind: "resolve-failed",
          reason:
            installError instanceof Error
              ? installError.message
              : String(installError),
        })
        return
      }

      // Successor confirmed installed — only now is the predecessor
      // released and κ written. Reordering these three lines is exactly the
      // defect the two-phase-handoff acceptance criterion (#1265) exists to
      // rule out.
      r.hold.release()
      r.committedRealization = realization
      transitionRecord(r, {
        kind: "resolve-committed",
        revision: realization.revision,
      })
    },

    invalidate(id): void {
      const r = record(records, id)
      // Re-engage the hold (idempotent if it never actually released —
      // COMMITTED's own predecessor was released at commit time, so this is
      // the real re-install) before tearing down the superseded successor,
      // mirroring resolveCommitted's ordering in reverse.
      r.hold.install()
      const previousRealization = r.committedRealization
      r.committedRealization = null
      transitionRecord(r, { kind: "invalidate" })
      previousRealization?.uninstall()
    },

    reRegister(id, contentEpoch): void {
      const r = record(records, id)
      r.hold.install()
      const previousRealization = r.committedRealization
      r.committedRealization = null
      transitionRecord(r, {
        kind: "re-register",
        contentEpoch,
      })
      previousRealization?.uninstall()
    },

    retire(id): void {
      const r = record(records, id)
      if (r.state.kind === "RETIRED") return
      r.committedRealization?.uninstall()
      r.committedRealization = null
      r.hold.release()
      transitionRecord(r, { kind: "retire" })
    },

    stateOf(id): RestingScopeState<Rho, Pi> | undefined {
      return records.get(id)?.state
    },

    isRegistered(id): boolean {
      return records.has(id)
    },

    ids(): ReadonlyArray<ScopeId> {
      return Array.from(records.keys())
    },

    snapshot(id): ScopeSnapshot<Rho, Pi> | undefined {
      const r = records.get(id)
      if (r === undefined) return undefined
      return { id, ref: r.ref, parent: r.parent, state: r.state }
    },
  }
}
