/**
 * S11 conformance-suite harness.
 *
 * This file is a *test fixture*, not part of the transport package — it is
 * bundled (via esbuild, see `global-setup.ts`) and injected into a real
 * browser page so Playwright can exercise the actual transport modules
 * under real DOM/MutationObserver/timing behavior, not jsdom.
 *
 * It wires the real four-stage pipeline (channel → estimator → adapter →
 * actuator) against `adapter/null-adapter.ts` — the only adapter this
 * suite imports — plus Bootstrap, Session, and Lifecycle. The one place
 * this file goes beyond the null adapter is `restoreOwnership()`, which
 * demonstrates Remark 7.2's ownership-signal path using only
 * `actuator/self-tag.ts` and `actuator/apply.ts` primitives — no `decide`
 * function, no invariant, no domain concept of any kind. It is exactly as
 * "business-logic-free" as a consumer wiring this package would be
 * required to keep everything *except* their own Adapter.
 */

import { apply, type ActionRealizer } from "../../../src/actuator/apply"
import {
  isSelfTagged,
  releaseOwnership,
  wasRemovedByVendor,
} from "../../../src/actuator/self-tag"
import { invoke } from "../../../src/adapter/invoke"
import { createNullAdapter } from "../../../src/adapter/null-adapter"
import * as bootstrap from "../../../src/bootstrap/static"
import type { Action } from "../../../src/contracts/action"
import { createDecayTracker } from "../../../src/estimator/decay"
import {
  createHypothesis,
  type MutableHypothesis,
} from "../../../src/estimator/hypothesis"
import {
  createProvenanceStore,
  update,
  type Evidence,
  type ProvenanceStore,
} from "../../../src/estimator/update"
import {
  teardownContent,
  teardownDocument,
  type Disposable,
} from "../../../src/lifecycle/teardown"
import {
  createCoalescer,
  type Coalescer,
} from "../../../src/scheduler/reconcile"
import {
  createContinuityCheck,
  identify,
  type ExtractionResult,
} from "../../../src/sensor/identity"
import { attachMutationObserver } from "../../../src/sensor/observer"
import {
  createSessionLifecycle,
  type SessionLifecycle,
} from "../../../src/session/lifecycle"

type Attrs = { readonly seq: number }

const hypothesis: MutableHypothesis<string, Attrs> = createHypothesis<
  string,
  Attrs
>()
const provenance: ProvenanceStore<string> = createProvenanceStore<string>()
const decay = createDecayTracker<string, Attrs>()
const continuity = createContinuityCheck<Element, string>()
const nullAdapter = createNullAdapter<string, Attrs>()
const session: SessionLifecycle = createSessionLifecycle({
  onReset: () => decay.reset(),
})

let tick = 0
function nextTick(): number {
  tick += 1
  return tick
}

let reconcileCount = 0
const coalescer: Coalescer = createCoalescer({ debounceMs: 20 }, () => {
  reconcileCount += 1
  invoke(hypothesis, nullAdapter) // always ∅ — Theorem D.2
})

function extractor(el: Element): ExtractionResult<string, Attrs> {
  const key = el.getAttribute("data-key")
  if (key === null) {
    return { tier: "raw" }
  }
  const valueAttr = el.getAttribute("data-value")
  if (valueAttr === null) {
    return { tier: "partial", key }
  }
  return { tier: "full", key, attrs: { seq: Number(valueAttr) } }
}

const ingestChannel = {
  ingest(record: MutationRecord): void {
    const el = record.target
    if (!(el instanceof Element) || isSelfTagged(el)) {
      return // Axiom 3.5 self-exclusion
    }
    // The harness's extractor reads attributes directly off `el` and
    // ignores `observed`; this placeholder only satisfies the (shared)
    // Attr shape identify() requires for its second parameter.
    const result = identify(el, { seq: 0 }, () => extractor(el), continuity)
    if (result.extraction.tier === "raw") {
      return
    }
    const key = result.extraction.key
    const attrs: Attrs =
      result.extraction.tier === "full" ? result.extraction.attrs : { seq: -1 }
    const evidence: Evidence<string, Attrs> = {
      key,
      epoch: session.epoch,
      tier: result.extraction.tier,
      timestamp: nextTick(),
      attrs,
    }
    update(hypothesis, provenance, evidence)
    decay.touch(key, evidence.timestamp)
    coalescer.trigger()
  },
}

let disposeObserver: Disposable | undefined

function startSensing(rootSelector: string): void {
  const root = document.querySelector(rootSelector)
  if (root === null) {
    throw new Error(`content root ${rootSelector} not found`)
  }
  disposeObserver = attachMutationObserver(root, ingestChannel, {
    attributes: true,
    childList: true,
    subtree: true,
  })
}

function currentDisposables(): ReadonlyArray<Disposable> {
  const list: Array<Disposable> = [coalescer.dispose]
  if (disposeObserver !== undefined) {
    list.push(disposeObserver)
  }
  return list
}

type PresenceAction = Action & {
  readonly kind: "e2e-presence"
  readonly key: string
}

const ownedElements = new Map<string, Element>()

const presenceRealizer: ActionRealizer<PresenceAction> = (action) => {
  const el = document.createElement("div")
  el.setAttribute("data-presence-marker", action.key)
  document.body.appendChild(el)
  ownedElements.set(action.key, el)
  return [el]
}

/** Demonstrates Remark 7.2's ownership-signal path using only self-tag + apply() — no adapter, no invariant. */
function markPresence(key: string): void {
  apply<PresenceAction>([{ kind: "e2e-presence", key }], {
    realize: presenceRealizer,
    tagValue: () => key,
  })
}

function intentionallyRemove(key: string): void {
  const el = ownedElements.get(key)
  if (el === undefined) return
  releaseOwnership(el)
  el.remove()
}

function hostileRemove(key: string): void {
  const el = ownedElements.get(key)
  if (el === undefined) return
  el.remove() // no releaseOwnership() — simulates a vendor script yanking our node
}

function reassertIfRemovedByVendor(key: string): boolean {
  const el = ownedElements.get(key)
  if (el === undefined || !wasRemovedByVendor(el)) {
    return false
  }
  ownedElements.delete(key)
  markPresence(key)
  return true
}

function isPresent(key: string): boolean {
  return document.querySelector(`[data-presence-marker="${key}"]`) !== null
}

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- TS global augmentation requires `interface`, not `type`
  interface Window {
    __transport: {
      installBootstrap(): { installedAt: number }
      isBootstrapInstalled(): boolean
      bootstrapInstalledAt(): number | undefined
      uninstallBootstrap(): void
      getEpoch(): number
      startSensing(rootSelector: string): void
      hypothesisSnapshot(): Record<string, Attrs>
      reconcileCount(): number
      teardownContentSession(): void
      teardownDocumentSession(): void
      markPresence(key: string): void
      intentionallyRemove(key: string): void
      hostileRemove(key: string): void
      reassertIfRemovedByVendor(key: string): boolean
      isPresent(key: string): boolean
      pendingTimerFired(): Promise<boolean>
    }
  }
}

window.__transport = {
  installBootstrap: (): { installedAt: number } => bootstrap.install(),
  isBootstrapInstalled: (): boolean => bootstrap.isInstalled(),
  bootstrapInstalledAt: (): number | undefined => bootstrap.installedAt(),
  uninstallBootstrap: (): void => bootstrap.uninstall(),
  getEpoch: (): number => session.epoch,
  startSensing,
  hypothesisSnapshot: (): Record<string, Attrs> => {
    const snapshot: Record<string, Attrs> = {}
    for (const key of hypothesis.keys()) {
      const value = hypothesis.get(key)
      if (value !== undefined) {
        snapshot[key] = value
      }
    }
    return snapshot
  },
  reconcileCount: (): number => reconcileCount,
  teardownContentSession: (): void => {
    teardownContent(currentDisposables(), session)
    disposeObserver = undefined
  },
  teardownDocumentSession: (): void => {
    teardownDocument(currentDisposables(), session, () => bootstrap.uninstall())
    disposeObserver = undefined
  },
  markPresence,
  intentionallyRemove,
  hostileRemove,
  reassertIfRemovedByVendor,
  isPresent,
  pendingTimerFired: (): Promise<boolean> =>
    new Promise((resolve) => {
      const before = reconcileCount
      setTimeout(() => resolve(reconcileCount > before), 50)
    }),
}

// Bootstrap installs the moment this bundle executes — the earliest hook
// available to a page-injected script, standing in for `document_start`
// (Definition D.2).
bootstrap.install()
