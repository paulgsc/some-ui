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
 * reuse). As of SF-DC (#1267) itself, nothing in *this module* ever called
 * `startResolving`/`resolveCommitted`/`resolveExonerated` — per that story's
 * own "out of scope" note, projecting the real dark adapter into a
 * discovered scope was explicitly routed to SF-AD (#1268), not this one.
 * SF-AD has since landed: `onScopeReady`, this factory's optional third
 * parameter, is the seam that closes that gap — called once a scope is
 * newly registered and again after every genuine vendor mutation inside it
 * (see the per-root observer below), so a caller wiring it to
 * `shadow-scope-theming.ts`'s own `project()` (as `content.ts` does) drives
 * every discovered scope the rest of the way to `COMMITTED`/
 * `EXONERATED_NATIVE`. This module still never calls those transitions
 * *itself* — it only ever offers the hook — so a caller with no adapter to
 * project (every one of this module's own unit tests included) gets exactly
 * SF-DC's original behavior: Remark D.3's shape, a scope left permanently in
 * `{HELD, RESOLVING, FAILED_HELD}`, `Phi_scope` still holding throughout via
 * the conservative-presentation disjunct alone, with no short-interval
 * requirement from Theorem D.3.
 *
 * The visible consequence *without* `onScopeReady` wired to a real adapter,
 * stated plainly because #1267's own posture note requires it ("state in
 * the PR body exactly what changed and why main stays correct through
 * it"): `createOcclusionHold`'s veil is `position: fixed; inset: 0` —
 * boundary-crossing by construction (its containing block is the viewport
 * regardless of which node, document root or nested shadow root, it is
 * mounted under) — so any auto-mode page carrying at least one open shadow
 * root would show a full-viewport occlusion for as long as that scope stays
 * registered. `content.ts` always wires the real projection now (SF-AD), so
 * this is no longer this codebase's own live behavior — it remains the
 * correct fallback for any future caller that discovers scopes with nothing
 * yet able to theme them, the same "on uncertainty, hold the whole affected
 * scope" conservatism the whole epic is built on.
 *
 * ## Per-root reactive re-arming
 *
 * A `MutationObserver` is attached to each newly-registered root at
 * registration time (not document-wide `subtree: true` — G0.2's trace 3,
 * and the DOM spec, both establish that never crosses a shadow boundary).
 * At SF-DC (#1267), this observer's job was mostly future-proofing — a
 * scope discovered by this module alone never left `HELD`, so there was
 * nothing yet for a same-root mutation to re-arm. SF-AD (#1268) is what
 * makes that load-bearing: with `onScopeReady` wired to a real projection,
 * a scope now does reach `COMMITTED`/`EXONERATED_NATIVE`, and this same
 * observer's three jobs are what keep it correct there — (1) `invalidate()`
 * a `COMMITTED`/`EXONERATED_NATIVE` scope back toward a held state on any
 * non-self-authored mutation inside it — Definition D.5's legal transition,
 * reused verbatim; (2) recurse for a newly-appearing *nested* shadow host,
 * since Definition D.4 is recursive and a mutation inside a registered root
 * is exactly how a deeper root becomes reachable; (3) call `onScopeReady`
 * itself, so that same genuine mutation also drives re-projection, not just
 * re-invalidation.
 * Axiom 3.5's discipline (`pipeline.ts`'s `isSelfAuthored`, reused as-is by
 * the document-wide observer in `observe()` below) is the wrong shape for
 * *this* per-root observer specifically, and this story went through two
 * revisions before landing on why. `isSelfAuthored`'s own "removal is never
 * self-authored" rule (Remark 7.2 — calibrated for reacting to a *hostile*
 * removal with one harmless extra scan round) is the wrong call for the
 * veil's *legitimate* removal — `scope-registry.ts`'s
 * `resolveCommitted()`/`resolveExonerated()` release the hold as part of a
 * successful two-phase handoff, and treating that release as vendor evidence
 * would immediately `invalidate()` the very commit/exoneration that release
 * just achieved (caught by this story's own test suite before it ever
 * reached a live page). An initial fix (`custody-primitive.ts` tagging the
 * veil `data-my-ext`, and a local `isHoldChurn` checking for that tag)
 * closed that specific case but turned out to still be attribute-based —
 * and a page (or an attribute-reconciling framework) stripping `data-my-ext`
 * or `HOLD_ATTR` from the veil, without removing it or touching its style,
 * silently broke identity recognition for every later mutation on that same
 * node, including this hold's own `reassert()`-driven churn, which then read
 * as fresh vendor evidence and re-triggered `reassert()` without bound
 * (bot-found, #1267's own review, round 6). `isHoldMutation` below replaces
 * both `isSelfAuthored` and `isHoldChurn` for this observer with one
 * identity-based check — `OcclusionHold.isOwnNode()`, object identity via
 * the hold's own closure-scoped element reference, never an attribute — so
 * this observer skips *only* the hold element's own add/remove/attribute
 * churn regardless of what markers survive on it. A mixed record that also
 * touches real content still takes the normal reactive path.
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
 * value across a same-document navigation. At SF-DC (#1267) this was moot —
 * no shadow scope this module registered ever reached either state, so
 * there was no stale value for a rollover to invalidate. SF-AD (#1268)
 * changes that (a scope can now genuinely be `COMMITTED`), but a still-live
 * shadow scope surviving an SPA route swap (one whose host was not detached
 * — `retireDetached()` above already handles the destroyed-and-recreated
 * case, which is the common one) is still not force-re-registered here: its
 * per-root observer already `invalidate()`s and re-`onScopeReady()`s it on
 * the *next* genuine vendor mutation the new route's content produces inside
 * it, which is the same reactive path a route swap that mutates that
 * subtree at all will hit regardless. The gap this leaves is narrower than
 * SF-DC's own version: a scope whose content the new route leaves
 * byte-for-byte unchanged keeps a still-valid `COMMITTED` realization
 * (correct — nothing to invalidate), while one the new route *does* touch is
 * caught by the observer as described. What is not (yet) covered is a scope
 * whose stale `COMMITTED` realization becomes wrong for reasons the DOM
 * itself never signals (extremely narrow; not `Safe_T`-violating either
 * way — `Phi_scope`'s conservative-presentation disjunct does not name the
 * epoch). Left as a documented gap for SF-OB (#1270) or a dedicated
 * follow-up, per this file's own disclosure discipline, rather than
 * expanding this story's scope to add a `reengage()`-equivalent sweep with
 * no concrete failing case motivating it yet.
 */

import type { Epoch } from "@some-extension/transport/session/epoch"

import { createOcclusionHold, type OcclusionHold } from "./custody-primitive"
import { DOCUMENT_SCOPE_ID } from "./document-scope"
import { isSelfAuthored } from "./pipeline"
import type { ScopeId, ScopeRegistry } from "./scope-registry"

/**
 * A realm-independent replacement for `node instanceof Element`. A page can
 * move an element created in a same-origin iframe's own realm into this
 * document (`adoptNode()`, or a plain `appendChild()` across documents,
 * which adopts implicitly) — the adopted node keeps the *source* realm's
 * `Element` constructor on its prototype chain, so it fails `instanceof`
 * against this realm's own `Element` global even though it is connected and
 * walkable. `nodeType` is a plain data property, not a prototype check, so
 * it is realm-independent (bot-found, #1267's own review).
 */
export function isElementNode(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE
}

/**
 * True when `record` is *purely* about `hold`'s own veil element — either a
 * `childList` record adding/removing it, or an `attributes` record targeting
 * it directly. Identity-checked via `hold.isOwnNode()` (object identity, via
 * `OcclusionHold`'s own closure-scoped `veil` reference) rather than by any
 * attribute the veil carries — `HOLD_ATTR`/`data-my-ext` are both public,
 * page-discoverable, and a page (or an attribute-reconciling framework)
 * stripping either one, without removing the element or changing its style,
 * previously broke identity recognition for every later mutation on this
 * same node, including this hold's own `reassert()`-driven remove-then-insert
 * churn (the DOM's own pre-insert algorithm generates that pair even when
 * `appendChild`ing an already-last-child node) — misread as fresh vendor
 * evidence, that triggered another `reassert()` and repeated without bound
 * (bot-found, #1267's own review, round 6). This is also why this function
 * covers `install()`'s own churn, this hold's legitimate `release()` upon a
 * successful commit/exoneration (Remark 7.2's "removal is never
 * self-authored" default is the wrong call for *this* element specifically —
 * see `custody-primitive.ts`'s own header), *and* the `style`-attribute
 * repair from a mutation the callback below reacted to in the same or an
 * earlier round — one check, one source of truth, rather than three
 * separately-reasoned-about cases. A record touching the hold element
 * *alongside* something else is not filtered — that mixed case still needs
 * the normal reactive path.
 */
function isHoldMutation(record: MutationRecord, hold: OcclusionHold): boolean {
  if (record.type === "attributes") return hold.isOwnNode(record.target)
  if (record.type === "childList") {
    const touched = [...record.addedNodes, ...record.removedNodes]
    return touched.length > 0 && touched.every((node) => hold.isOwnNode(node))
  }
  return false
}

/**
 * True for an attribute record that is purely this extension's own
 * `data-sw-patched` tagging write — SF-AD's (#1268) `shadow-scope-theming.ts`
 * is the one thing, besides the hold itself, that ever writes an attribute
 * inside a registered shadow scope: its per-scope realization tags a
 * classified element via `actuator.ts`'s (reused) `tagSurfaceElements`,
 * exactly the kind of DOM write `isHoldMutation` does not cover (it targets
 * an arbitrary vendor element, never the hold's own veil). Unlike
 * `isHoldMutation`, this is a plain attribute-name check, not an
 * identity one — safe here specifically because `data-sw-patched` is an
 * attribute name this codebase alone ever writes (the same reasoning
 * `pipeline.ts`'s own Sensor observer already relies on by *excluding*
 * `data-sw-patched` from its `attributeFilter` entirely; this observer
 * cannot do the same, since it also needs `attributes: true` broadly for
 * the hold's own `style`/`aria-hidden` self-heal repairs). Left unfiltered,
 * a fresh per-scope tag write would misread as vendor evidence and
 * immediately `invalidate()` the very commit that write is itself a part
 * of — the same self-feedback-loop class #831 and this story's own SF-DC
 * predecessor (round 6, `HOLD_ATTR`/`isOwnNode`) both had to close.
 */
function isThemeTaggingMutation(record: MutationRecord): boolean {
  return (
    record.type === "attributes" && record.attributeName === "data-sw-patched"
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

/**
 * SF-OB (#1270): which of this module's two discovery paths found a scope —
 * "roots found by initial census vs. reactive mutation discovery," per that
 * story's own acceptance criteria. `"census"` is an explicit top-down
 * `discover()` sweep (the initial one, and every later defensive one
 * `content.ts` runs on `yt-navigate-finish` — both are the same kind of
 * deliberate, systematic walk, as opposed to a passive reaction to one
 * specific mutation). `"reactive"` is everything triggered by this module's
 * own ambient machinery instead: the top-level `MutationObserver` in
 * `observe()`, the `DISCOVERY_POLL_MS` backstop poll, and a nested root
 * found by a per-root observer's own re-walk of its scope. A nested root
 * found *during* an outer scope's own registration (the recursive `walk()`
 * call inside `registerShadowRoot()`, before that call returns) inherits its
 * parent's method — it is part of the same pass, not a separate discovery
 * event.
 */
export type ShadowScopeDiscoveryMethod = "census" | "reactive"

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
  contentEpoch: () => Epoch,
  /**
   * SF-AD (#1268): called once a scope is ready for its own dark-adapter
   * projection — immediately after it is first registered (before this
   * function's own `register()` call returns from `registerShadowRoot()`),
   * and again after every genuine vendor mutation this module's own
   * per-root observer reacts to (whether or not that mutation actually
   * called `invalidate()` — a still-`HELD`, never-yet-committed scope
   * getting its first real content is exactly as reason to project as an
   * invalidated `COMMITTED` one). `id`'s own state at call time governs
   * what happens: `shadow-scope-theming.ts`'s own `project()` no-ops for
   * anything other than `HELD`/`RESOLVING`/`FAILED_HELD`. Optional —
   * omitted by every caller that only cares about discovery/custody and
   * has no adapter to project (this module's own unit tests included).
   */
  onScopeReady?: (id: ScopeId) => void,
  /** SF-OB (#1270): called once per newly-registered scope, immediately after `registerShadowRoot()`'s own `registry.register()` call, naming which discovery path found it. Optional — omitted by every caller with no coverage instrument to feed (this module's own unit tests included), mirroring `onScopeReady`'s own optionality. */
  onDiscovered?: (id: ScopeId, method: ShadowScopeDiscoveryMethod) => void
): ShadowScopeDiscovery {
  const idFor = new WeakMap<ShadowRoot, ScopeId>()
  const rootFor = new Map<ScopeId, ShadowRoot>()
  const observerFor = new Map<ScopeId, MutationObserver>()
  const hostObserverFor = new Map<ScopeId, MutationObserver>()
  let topObserver: MutationObserver | null = null
  let pollHandle: ReturnType<typeof setInterval> | null = null
  let nextId = 0

  function forget(id: ScopeId, shadow: ShadowRoot): void {
    // registry.retire(id) below releases this scope's OcclusionHold via
    // its own stored ScopeRegistration — no separate hold-by-id bookkeeping
    // needed here.
    registry.retire(id)
    registry.purge(id)
    observerFor.get(id)?.disconnect()
    observerFor.delete(id)
    hostObserverFor.get(id)?.disconnect()
    hostObserverFor.delete(id)
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

  /**
   * The live root a scope's `parent` id resolves to — `document` for
   * `DOCUMENT_SCOPE_ID`, another scope's own `ShadowRoot` otherwise (looked
   * up in `rootFor`, so a parent that has *already* been forgotten this same
   * pass resolves to `undefined`, cascading retirement to its children in
   * the same call — see `retireDetached()`'s own comment).
   */
  function parentRootOf(id: ScopeId): Document | ShadowRoot | undefined {
    const parentId = registry.snapshot(id)?.parent
    if (parentId === null || parentId === undefined) return undefined
    return parentId === DOCUMENT_SCOPE_ID ? document : rootFor.get(parentId)
  }

  /**
   * Retires every registered scope whose host is no longer reachable from
   * its *recorded parent* scope — not merely "connected to some document,"
   * which `Node.isConnected` alone cannot distinguish from "connected to a
   * different document, or a different part of this one, than the parent
   * this scope was registered under." A page moving a registered host into
   * a same-origin iframe's own document, or from one shadow root into a
   * different one, leaves `isConnected` true throughout, which would
   * otherwise never retire the stale record — leaking its hold/observer
   * indefinitely and, worse, leaving `main`'s own registry still believing
   * it is responsible for custody of content it no longer structurally
   * contains (bot-found, #1267's own review).
   *
   * Iterating `rootFor` in insertion order is what makes single-pass
   * cascading retirement correct without a second pass: a nested scope is
   * only ever registered (`registerShadowRoot`'s own recursive `walk()`
   * call) *after* its parent's own entry already exists in `rootFor`, so a
   * parent forgotten earlier in this same loop already resolves to
   * `undefined` in `parentRootOf` by the time this loop reaches its child,
   * retiring it too — `L_R(r) ⊆ L_R(r')` (Definition D.4), enforced
   * structurally rather than by a second sweep.
   */
  function retireDetached(): void {
    for (const [id, shadow] of rootFor) {
      if (parentRootOf(id)?.contains(shadow.host) === true) continue
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
  function rewalkKnownRoots(method: ShadowScopeDiscoveryMethod): void {
    for (const [id, shadow] of rootFor) {
      walk(shadow, id, method)
    }
  }

  function walk(
    root: Node,
    parentId: ScopeId,
    method: ShadowScopeDiscoveryMethod
  ): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
    let node = walker.nextNode()
    while (node !== null) {
      // Not `node instanceof Element`: a page can move an element created
      // in a same-origin iframe's own realm into this document via
      // `adoptNode()`/`appendChild()`. The adopted node keeps the source
      // realm's `Element` constructor on its prototype chain, so it fails
      // `instanceof` against *this* realm's `Element` global even though it
      // is connected, walkable, and may carry a real open shadow root —
      // `nodeType` is a plain data property, not a prototype check, so it
      // is realm-independent (bot-found, #1267's own review).
      if (isElementNode(node) && node.shadowRoot !== null) {
        const shadow = node.shadowRoot
        if (!idFor.has(shadow)) registerShadowRoot(shadow, parentId, method)
      }
      node = walker.nextNode()
    }
  }

  function registerShadowRoot(
    shadow: ShadowRoot,
    parentId: ScopeId,
    method: ShadowScopeDiscoveryMethod
  ): void {
    const id: ScopeId = `shadow:${(nextId += 1)}`
    const hold = createOcclusionHold(shadow)
    idFor.set(shadow, id)
    rootFor.set(id, shadow)

    registry.register(id, {
      ref: shadow,
      parent: parentId,
      contentEpoch: contentEpoch(),
      hold,
    })
    onDiscovered?.(id, method)

    const observer = new MutationObserver((mutations) => {
      // Not isSelfAuthored here (unlike the document-wide observer in
      // observe() below): the only extension-authored node any code path in
      // this codebase ever places inside a shadow scope is this hold's own
      // veil, so isHoldMutation's identity check already subsumes it —
      // without also inheriting isSelfAuthored's attribute-dependent
      // isExtensionAuthored check, which is exactly the fragile check this
      // story's round-6 review found breaking under marker-attribute
      // removal (see isHoldMutation's own doc comment).
      const sawVendorMutation = mutations.some(
        (record) =>
          !isHoldMutation(record, hold) && !isThemeTaggingMutation(record)
      )
      if (sawVendorMutation) {
        const state = registry.stateOf(id)
        if (
          state?.kind === "COMMITTED" ||
          state?.kind === "EXONERATED_NATIVE"
        ) {
          registry.invalidate(id)
        }
        // CSS's own tie-break rule for stacking contexts sharing a z-index
        // is document order — later wins. A vendor element inserted after
        // this hold, sharing its own maximal z-index, would otherwise paint
        // on top of it indefinitely once the scope settles into HELD (which
        // this story's own scopes never leave — see this module's header),
        // since install()'s idempotency guard alone never re-positions an
        // already-connected veil. Re-stacking on every genuine vendor
        // mutation, not just at registration, keeps winning that tie
        // (bot-found, #1267's own review).
        hold.reassert()
        // SF-AD (#1268): real content changed inside this scope (its very
        // first content, if still HELD; a re-classification-worthy change,
        // if just invalidated above) — project the dark adapter into it
        // again rather than waiting for some unrelated later trigger.
        onScopeReady?.(id)
      }
      // Regardless of self-authorship: a mutation inside this root can
      // introduce a newly-attached *nested* shadow host (Definition D.4's
      // recursive case), which must not wait for its own reaction to be
      // discovered. A mutation-triggered find is "reactive" even here, one
      // nesting level in.
      walk(shadow, id, "reactive")
    })
    observer.observe(shadow, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
    })
    observerFor.set(id, observer)

    // SF-AD (#1268), bot-found: the per-root observer above watches *inside*
    // `shadow` — it cannot see a change to the host's own `class`/`style`,
    // which lives in the host's *parent* scope, not this one. A component
    // toggling its own host class to drive a `:host(.dark)` rule inside its
    // shadow stylesheet (a standard, documented Shadow DOM theming pattern)
    // would otherwise leave this scope's own COMMITTED/EXONERATED_NATIVE
    // verdict stale indefinitely, with nothing to re-trigger projection.
    // Watching `shadow.host` directly (not the whole document, and not
    // limited to top-level scopes the way a single document-wide observer
    // would be — this runs per scope, at any nesting depth) closes the
    // common case. `class`/`style` specifically, mirroring `pipeline.ts`'s
    // own document-level Sensor: no code path in this codebase ever writes
    // either attribute on an arbitrary host element (per-surface tagging is
    // `data-sw-patched`, a distinct attribute this filter already excludes),
    // so every record this callback sees is genuine vendor evidence, with no
    // self-authorship check needed.
    //
    // Deliberately not, and disclosed rather than silently left unhandled:
    // an *ancestor* (not the host itself) redefining a CSS custom property
    // this shadow tree's own stylesheet consumes via `var()` — e.g. a
    // theme-wide class toggled several levels up. Watching every registered
    // scope's entire ancestor chain for this would be materially more
    // machinery (and still incomplete — the same property can change via an
    // adopted stylesheet with no attribute mutation at all) for a
    // narrower-in-practice case than the direct host-class pattern this
    // closes; routed to a dedicated follow-up rather than expanding this
    // story's scope mid-review.
    const hostObserver = new MutationObserver((mutations) => {
      if (mutations.length === 0) return
      const state = registry.stateOf(id)
      if (state?.kind === "COMMITTED" || state?.kind === "EXONERATED_NATIVE") {
        registry.invalidate(id)
      }
      onScopeReady?.(id)
    })
    hostObserver.observe(shadow.host, {
      attributes: true,
      attributeFilter: ["class", "style"],
    })
    hostObserverFor.set(id, hostObserver)

    // Recurse immediately, before this call returns — a nested root already
    // present at discovery time must not wait for a mutation that may never
    // come. Inherits `method`: a nested root found during this same
    // registration pass is part of the same discovery event as its parent,
    // not a separate one.
    walk(shadow, id, method)

    // SF-AD (#1268): a newly-registered scope is HELD but never yet
    // projected — its first classification round must not wait for a
    // mutation the per-root observer above might never see (a shadow root
    // populated once at creation and never touched again is exactly the
    // issue's own reported repro shape).
    onScopeReady?.(id)
  }

  // retireDetached() runs FIRST in all three call sites below, before either
  // walk — not an arbitrary ordering choice. A host that moved from its
  // recorded parent into a *different*, still-live registered scope is
  // still in idFor at the start of this pass (nothing has forgotten it
  // yet), so a walk that ran first would find it already-known under its
  // new location and skip it; only after retireDetached() has cleared its
  // stale idFor/registry entry does the walk that follows see a genuinely
  // unregistered root and register it fresh, in this same pass, with no
  // uncovered interval in between (bot-found, #1267's own review, round 5).
  return {
    discover(root): void {
      retireDetached()
      walk(root, DOCUMENT_SCOPE_ID, "census")
      rewalkKnownRoots("census")
    },

    observe(): void {
      if (topObserver !== null) return
      topObserver = new MutationObserver((mutations) => {
        for (const record of mutations) {
          if (isSelfAuthored(record)) continue
          retireDetached()
          walk(document.documentElement, DOCUMENT_SCOPE_ID, "reactive")
          rewalkKnownRoots("reactive")
          return
        }
      })
      topObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
      })
      pollHandle = setInterval(() => {
        retireDetached()
        walk(document.documentElement, DOCUMENT_SCOPE_ID, "reactive")
        rewalkKnownRoots("reactive")
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
