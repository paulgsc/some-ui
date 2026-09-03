/**
 * Shadow-aware discovery and local custody — canon §D.2, Definition D.4
 * (rendering-scope lifetime `L_R`) and Corollary D.3.1 ("reactive/periodic
 * discovery is sound; creation-time interception is neither required nor
 * available"). SF-DC, #1267, part of the SF-SCOPE epic (#1263). Needs SF-RG
 * (#1265, `scope-registry.ts`/`custody-primitive.ts`) and SF-BS (#1266,
 * `document-scope.ts` — the document must already be a custody law before
 * this asks it to recurse).
 *
 * G0.4 already foreclosed the naive design ("patch `attachShadow`, hold at
 * creation"): a `document_start` isolated-world patch does not observe a
 * main-world page's own call, and declarative Shadow DOM has no
 * `attachShadow()` call to intercept at all, from any world. What this
 * module does instead — reactive discovery, coarse hold until then — is
 * exactly what Corollary D.3.1 proves sound: a scope may sit live-but-
 * unregistered for a nonzero interval, covered instead by its *ancestor's*
 * boundary-crossing custody, provided (a) this module's own registration
 * write is instantaneous with its trigger and (b) the ancestor stays
 * boundary-crossing-covered throughout. For a shadow root parented directly
 * on the document, that ancestor coverage is `r_0`'s own Bootstrap veil
 * during initial load (Corollary D.1.1) — but *not* after auto mode commits
 * a theme and releases that veil, since auto's per-surface realization
 * (`data-sw-patched` tagging) is not boundary-crossing the way legacy's
 * document-level `filter: invert(...)` is (G0.7). That is why this module's
 * own registration signal cannot be the debounced, 50ms-coalesced pipeline
 * scan — G0.5 already falsified exactly that shape (a recursive-scan-only
 * remedy, spiked against the real extension, still leaked native-bright
 * frames throughout a sustained mutation burst, because the scan ran
 * *inside* the debounce window). Discovery here instead runs synchronously
 * inside a dedicated `MutationObserver`'s own microtask callback — never
 * debounced, never routed through `pipeline.ts`'s coalescer — so a newly
 * live scope's hold is installed before the next paint has a chance to
 * composite it unheld (Remark 1.5: microtask-phase reactions precede the
 * animation-frame/paint phase a raw mutation's own repaint lands in).
 *
 * ## What "custody" means here, and what it deliberately does not do yet
 *
 * A newly-discovered shadow root is registered `HELD` via
 * `custody-primitive.ts`'s `createOcclusionHold` (not `document-scope.ts`'s
 * `createPrepaintCustody` — a shadow scope has no pre-existing veil to
 * reuse) and **stays there**. Nothing in this module ever calls
 * `startResolving`/`resolveCommitted`/`resolveExonerated` — per #1267's own
 * "out of scope" note, projecting the real dark adapter into a discovered
 * scope is SF-AD's (#1268) job, not this one's, and Remark D.3 already
 * describes exactly this shape: instantiated against a scope with no
 * adapter targeting it, a conforming registry leaves that scope permanently
 * in `{HELD, RESOLVING, FAILED_HELD}` — `Phi_scope` still holds throughout
 * (the conservative-presentation disjunct alone discharges it), and Theorem
 * D.3 does not require the interval to be short.
 *
 * The visible consequence, stated plainly because #1267's own posture note
 * requires it ("state in the PR body exactly what changed and why main
 * stays correct through it"): `createOcclusionHold`'s veil is
 * `position: fixed; inset: 0` — boundary-crossing by construction (its
 * containing block is the viewport regardless of which node, document root
 * or nested shadow root, it is mounted under) — so **any auto-mode page
 * carrying at least one open shadow root now shows a full-viewport
 * occlusion for as long as that scope stays registered, until SF-AD adds a
 * resolution path for it.** This is not a bug this story introduces and
 * fails to close; it is the canon's own "on uncertainty, hold the whole
 * affected scope — false-positive custody... [is an] admissible cost"
 * applied literally, and the alternative — leaving a discovered scope
 * unheld until some future story gets around to theming it — is exactly
 * the native-bright leak G0.2/G0.5 exist to rule out. `main` stays correct
 * (zero-leak, `Phi_scope` holds) throughout; it does not stay *unchanged*.
 *
 * ## Per-root reactive re-arming
 *
 * A `MutationObserver` is attached to each newly-registered root at
 * registration time (not document-wide `subtree: true` — G0.2's trace 3,
 * and the DOM spec, both establish that never crosses a shadow boundary).
 * Its job today is mostly future-proofing: since a scope discovered by this
 * module never leaves `HELD`, there is nothing for a same-root mutation to
 * re-arm *yet*. It still does the two jobs #1267's acceptance criteria asks
 * for, both load-bearing the day SF-AD starts resolving these scopes: (1)
 * `invalidate()` a `COMMITTED`/`EXONERATED_NATIVE` scope back toward a held
 * state on any non-self-authored mutation inside it — Definition D.5's
 * legal transition, reused verbatim; (2) recurse for a newly-appearing
 * *nested* shadow host, since Definition D.4 is recursive and a mutation
 * inside a registered root is exactly how a deeper root becomes reachable.
 * `isSelfAuthored` (`pipeline.ts`, Axiom 3.5) is reused as-is for genuine
 * vendor evidence — extending its discipline to a shadow-scoped observer
 * needed two fixes, though. First, in `custody-primitive.ts` alongside this
 * story: the occlusion veil itself now carries `data-my-ext`, the same
 * ownership tag `prepaint.ts`'s veil already carried, so `isSelfAuthored`
 * correctly recognizes the veil's own install/self-heal churn. Second,
 * here: `isSelfAuthored`'s own "removal is never self-authored" rule
 * (Remark 7.2 — calibrated for reacting to a *hostile* removal with one
 * harmless extra scan round) is the wrong call for the veil's *legitimate*
 * removal — `scope-registry.ts`'s `resolveCommitted()`/`resolveExonerated()`
 * release the hold as part of a successful two-phase handoff, and treating
 * that release as vendor evidence would immediately `invalidate()` the very
 * commit/exoneration that release just achieved (caught by this story's own
 * test suite before it ever reached a live page). `isHoldChurn` below closes
 * that gap by name, via `custody-primitive.ts`'s exported `HOLD_ATTR`, so
 * this observer skips *only* the hold element's own add/remove — a mixed
 * record that also touches real content still takes the normal reactive
 * path.
 *
 * ## Root registry lifecycle (§8.3 checklist item)
 *
 * A scope retires when its host disconnects (Definition D.4: `L_R(r)` ends
 * "when r's host is detached from a live scope") — checked reactively on
 * every `discover()` pass rather than via a dedicated observer, since
 * detachment is visible in the *parent* scope's own tree, which `discover()`
 * already walks. Retiring releases the hold, disconnects the per-root
 * observer, and `purge()`s the record from `scope-registry.ts`'s own `Map`
 * (a new export this story adds there — `retire()` alone only transitions
 * state, it does not remove the record or its strong reference to the
 * scope's `ShadowRoot`, so a page whose shadow-hosting components come and
 * go would otherwise accumulate every one of them for the life of the
 * content script — bot-found, #1267's own review). Purging also drops this
 * module's own `idFor` entry for the scope: leaving it would make
 * `walk()`'s `!idFor.has(shadow)` check skip a *later* re-attachment of the
 * same physical host forever, contradicting Definition D.5's own "a later
 * re-attachment... is a new scope with fresh identity" (bot-found, same
 * review round). Not implemented here: forcing every still-live shadow
 * scope through
 * Definition D.5's `re-register` transition on a content-epoch rollover
 * (`document-scope.ts`'s `reengage()` does this for `r_0` alone). That
 * transition exists to invalidate a stale `COMMITTED`/`EXONERATED_NATIVE`
 * value across a same-document navigation — since no shadow scope this
 * module registers ever reaches either state, there is no stale value for
 * a rollover to invalidate, and `Safe_T`'s first disjunct (conservative
 * presentation) does not name the epoch at all. Left as a documented gap
 * for whichever of SF-AD/SF-OB adds real resolution, rather than an
 * unmotivated transition with no observable effect today.
 */

import type { Epoch } from "@some-extension/transport/session/epoch"

import { createOcclusionHold, HOLD_ATTR } from "./custody-primitive"
import { DOCUMENT_SCOPE_ID } from "./document-scope"
import { isSelfAuthored } from "./pipeline"
import type { ScopeId, ScopeRegistry } from "./scope-registry"

/**
 * True when `record` is *purely* the occlusion hold element itself being
 * added or removed from the scope's root — its `install()`/self-heal
 * churn (already caught by `isSelfAuthored` below, since the veil now
 * carries `data-my-ext`) *and* its legitimate `release()` upon a successful
 * commit or exoneration, which `isSelfAuthored`'s own removal branch would
 * otherwise misclassify as vendor evidence (Remark 7.2's "our node is gone
 * is ambiguous" reasoning is calibrated for reacting to a hostile removal
 * with one harmless extra scan round — invalidating a scope this hold's own
 * release just resolved is not harmless, it undoes the resolution). A
 * record touching the hold element *alongside* something else is not
 * filtered — that mixed case still needs the normal reactive path.
 */
function isHoldChurn(record: MutationRecord): boolean {
  if (record.type !== "childList") return false
  const touched = [...record.addedNodes, ...record.removedNodes]
  return (
    touched.length > 0 &&
    touched.every(
      (node) => node instanceof Element && node.hasAttribute(HOLD_ATTR)
    )
  )
}

/**
 * `SS_poll`'s own cadence, generalized to scope discovery (Definition 3.3,
 * Remark 3.2). Bounds the one discovery-latency gap the
 * `MutationObserver`-based reactive path structurally cannot see: a host
 * whose `attachShadow()` call runs well after its own insertion (a custom
 * element upgraded some time later, e.g. its definition loading late)
 * produces no further light-DOM mutation for the top-level observer to
 * react to — `attachShadow()` itself is not an observable mutation, the
 * same G0.4 fact this module's own header already leans on. Set an order of
 * magnitude tighter than `some-censor`'s own `retryUnresolved()` precedent
 * (500ms) the canon cites, deliberately: `retryUnresolved()` bounds
 * staleness of an already-covered key, where a wider margin is a latency
 * cost, not a safety one; this bounds a window during which a scope can
 * paint *natively*, uncovered, which is the failure class G0.2/G0.5 exist
 * to rule out, so it is worth paying more frequent, cheap (no
 * `getComputedStyle`, structural-only) walks to keep tight.
 *
 * A `requestAnimationFrame`-driven loop — tying the bound to the actual
 * paint cadence rather than a fixed timer — was considered and rejected for
 * this codebase specifically: `vitest.setup.ts` stubs `requestAnimationFrame`
 * to invoke its callback *synchronously*, which a self-rescheduling rAF
 * loop turns into unbounded synchronous recursion inside a single test run.
 * `setInterval`, gated by the real (or fake, per-test) timer queue, has no
 * such hazard.
 *
 * Stated plainly, because leaving it implicit would be exactly the kind of
 * silent gap this canon's own disclosure discipline forbids (§8.3's
 * "unsupported-latent-scope disclosure" checklist item, generalized here to
 * a *timing* gap rather than a *coverage-category* one): this bound is not
 * zero, and cannot be made zero by a purely reactive-plus-poll design over
 * this platform — G0.4 already proved no synchronous interception primitive
 * exists for `attachShadow()`, and the only architecture that *would* close
 * this to zero (never releasing the document's own conservative hold while
 * auto mode is active, replacing SF-BS's per-surface realization with a
 * second permanent, boundary-crossing veil) reintroduces exactly the
 * "independently self-healing occlusion alongside the real theme" shape
 * `document-scope.ts`'s own header already rejects. `DISCOVERY_POLL_MS`
 * trades a bounded, disclosed, order-of-magnitude-reduced exposure window
 * for keeping the extension's actual purpose (a themed, not permanently
 * blacked-out, page) intact.
 */
export const DISCOVERY_POLL_MS = 100

export type ShadowScopeDiscovery = {
  /**
   * Walks `root`'s descendants for open shadow roots not yet registered,
   * registering + holding each synchronously (Definition D.5's registration
   * is instantaneous) and recursing into every newly-registered root for a
   * nested one — then retires any previously-registered scope whose host
   * has since disconnected. Safe to call repeatedly; already-registered
   * roots are skipped in O(1) per element via an internal `WeakMap`.
   */
  discover(root: Document | ShadowRoot): void

  /**
   * Starts a dedicated, document-wide `MutationObserver` (`childList` +
   * `subtree`, no `attributeFilter` — a new shadow host arrives via
   * insertion, never an attribute change) that re-runs `discover()`
   * synchronously — never debounced — on every non-self-authored mutation,
   * plus a `DISCOVERY_POLL_MS` periodic poll (`SS_poll`, canon §3.2) as a
   * backstop for the one gap the observer alone cannot see — see
   * `DISCOVERY_POLL_MS`'s own doc comment. Idempotent.
   */
  observe(): void

  /**
   * Disconnects the top-level observer, the poll, and every per-root
   * observer, and retires + purges every scope this instance registered
   * (releasing its hold and dropping the registry's own record of it, so a
   * later `discover()`/`observe()` on the same or a new page section starts
   * clean rather than skipping roots this instance already forgot about).
   */
  teardown(): void
}

export function createShadowScopeDiscovery<Rho, Pi>(
  registry: ScopeRegistry<Rho, Pi>,
  contentEpoch: () => Epoch
): ShadowScopeDiscovery {
  const idFor = new WeakMap<ShadowRoot, ScopeId>()
  const rootFor = new Map<ScopeId, ShadowRoot>()
  const observerFor = new Map<ScopeId, MutationObserver>()
  let topObserver: MutationObserver | null = null
  let pollHandle: ReturnType<typeof setInterval> | null = null
  let nextId = 0

  function forget(id: ScopeId, shadow: ShadowRoot): void {
    registry.retire(id)
    registry.purge(id)
    observerFor.get(id)?.disconnect()
    observerFor.delete(id)
    rootFor.delete(id)
    // idFor is a WeakMap, so it never needs to be swept for garbage —
    // deleting the entry explicitly is still required, though: a live
    // ShadowRoot object staying mapped to a now-purged id would make
    // walk()'s `!idFor.has(shadow)` check skip re-registering it forever,
    // even though Definition D.5 makes RETIRED absorbing and requires a
    // later re-attachment of the same physical host to be treated as a
    // *new* scope with fresh identity (the same non-permanence Proposition
    // 4.1 already establishes for keys) — bot-found (#1267's own review).
    idFor.delete(shadow)
  }

  function retireDetached(): void {
    for (const [id, shadow] of rootFor) {
      if (shadow.host.isConnected) continue
      forget(id, shadow)
    }
  }

  /**
   * Re-walks every currently-registered root's own content for a *nested*
   * shadow host that appeared without a mutation the outer root's per-root
   * observer could see — the recursive form of the same late-`attachShadow`
   * gap `DISCOVERY_POLL_MS` exists for, one level deeper. `walk()` alone
   * only descends into a root at the moment it is *first* registered; a
   * plain top-level `walk(document.documentElement, ...)` finds only the
   * outer host again on every later call (already present in `idFor`) and,
   * by design, never re-descends into an already-known root on its own —
   * so without this, a nested late upgrade would stay undiscovered
   * indefinitely, not just for one poll interval (bot-found, #1267's own
   * review).
   */
  function rewalkKnownRoots(): void {
    for (const [id, shadow] of rootFor) {
      walk(shadow, id)
    }
  }

  function walk(root: Node, parentId: ScopeId): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
    let node = walker.nextNode()
    while (node !== null) {
      if (node instanceof Element && node.shadowRoot !== null) {
        const shadow = node.shadowRoot
        if (!idFor.has(shadow)) registerShadowRoot(shadow, parentId)
      }
      node = walker.nextNode()
    }
  }

  function registerShadowRoot(shadow: ShadowRoot, parentId: ScopeId): void {
    const id: ScopeId = `shadow:${(nextId += 1)}`
    idFor.set(shadow, id)
    rootFor.set(id, shadow)

    registry.register(id, {
      ref: shadow,
      parent: parentId,
      contentEpoch: contentEpoch(),
      hold: createOcclusionHold(shadow),
    })

    const observer = new MutationObserver((mutations) => {
      const sawVendorMutation = mutations.some(
        (record) => !isSelfAuthored(record) && !isHoldChurn(record)
      )
      if (sawVendorMutation) {
        const state = registry.stateOf(id)
        if (
          state?.kind === "COMMITTED" ||
          state?.kind === "EXONERATED_NATIVE"
        ) {
          registry.invalidate(id)
        }
      }
      // Regardless of self-authorship: a mutation inside this root can
      // introduce a newly-attached *nested* shadow host (Definition D.4's
      // recursive case), which must not wait for its own reaction to be
      // discovered.
      walk(shadow, id)
    })
    observer.observe(shadow, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
    })
    observerFor.set(id, observer)

    // Recurse immediately, before this call returns — a nested root already
    // present at discovery time must not wait for a mutation that may never
    // come.
    walk(shadow, id)
  }

  return {
    discover(root): void {
      walk(root, DOCUMENT_SCOPE_ID)
      rewalkKnownRoots()
      retireDetached()
    },

    observe(): void {
      if (topObserver !== null) return
      topObserver = new MutationObserver((mutations) => {
        for (const record of mutations) {
          if (isSelfAuthored(record)) continue
          walk(document.documentElement, DOCUMENT_SCOPE_ID)
          rewalkKnownRoots()
          retireDetached()
          return
        }
      })
      topObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
      })
      pollHandle = setInterval(() => {
        walk(document.documentElement, DOCUMENT_SCOPE_ID)
        rewalkKnownRoots()
        retireDetached()
      }, DISCOVERY_POLL_MS)
    },

    teardown(): void {
      topObserver?.disconnect()
      topObserver = null
      if (pollHandle !== null) {
        clearInterval(pollHandle)
        pollHandle = null
      }
      for (const [id, shadow] of rootFor) {
        forget(id, shadow)
      }
    },
  }
}
