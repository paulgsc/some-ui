/**
 * The production custody primitive — canon §D.2, §8.3's "custody primitive"
 * checklist item: "the concrete conservative-presentation mechanism
 * realizing a HELD/RESOLVING/FAILED_HELD scope... and an argument that it is
 * boundary-crossing." SF-RG (#1265).
 *
 * Shape proved sound by Gate 0's G0.6 falsification spike
 * (`tests/e2e/fixtures/occlusion-primitive.ts`, harness-only, never
 * imported from here): a synchronously-installed, theme-independent,
 * permanently-engaged-until-released occlusion, self-healing via its own
 * `MutationObserver` against removal. This is that shape written as real
 * production code — parameterized over `ScopeRef` (a `Document` or a
 * `ShadowRoot`, Definition D.4) instead of hardcoded to
 * `document.documentElement`, so `scope-registry.ts`'s `register()` can
 * install one per scope rather than only ever falling back to a single
 * document-wide veil.
 *
 * *Boundary-crossing* (Definition D.5): the occlusion is `position: fixed`,
 * whose containing block is the viewport regardless of which node — document
 * root or a nested shadow root — it is mounted under (shadow-tree nesting
 * does not itself establish a new containing block). It therefore covers
 * every pixel any live descendant of the scope could paint *within the
 * ordinary stacking-context tree*, registered or not, satisfying the
 * boundary-crossing argument Theorem D.3's inductive step and Corollary
 * D.3.1 both rely on — deliberately the coarsest, most conservative instance
 * of the primitive (canon: "on uncertainty, hold the whole affected scope —
 * false-positive custody... [is an] admissible cost"), not a
 * per-scope-bounded mask.
 *
 * *Known gap, not this story's to close*: browser top-layer content (a
 * native `<dialog>` shown via `showModal()`, the Popover API, `:fullscreen`)
 * paints in a compositing layer above the entire ordinary stacking-context
 * tree regardless of `z-index` — no `position: fixed` element, however high
 * its `z-index`, can cover it. A live descendant promoted to the top layer
 * while this scope is held is therefore *not* covered by this primitive.
 * This is the same top-layer question the epic (#1263) already tracks as
 * open — Gate 0's G0.7 explicitly did not test it, and SF-LG (#1269) is
 * where it "resolves (or explicitly re-defers, same posture as #1191)" —
 * not a gap this story's own acceptance criteria asks it to close, and not
 * silently claimed closed here either (§8.3's "unsupported-latent-scope
 * disclosure" checklist item is the same discipline this comment follows).
 *
 * *A second known gap, disclosed under that same discipline, bot-found by
 * SF-DC's (#1267) own review (round 6) — this file's own "boundary-crossing"
 * claim above is narrower than it reads*: "shadow-tree nesting does not
 * itself establish a new containing block" is true exactly as stated, but a
 * shadow host — or any of *its* ancestors, up to the viewport — establishing
 * one via ordinary CSS (`transform`, `filter`, `perspective`, or
 * `contain: paint|layout|strict|content`) is a completely separate,
 * shadow-DOM-independent mechanism this primitive does not account for: the
 * containing-block rule for `position: fixed` operates over the *painted*
 * (flattened) tree, so a `transform`/`contain`-bearing ancestor bounds this
 * veil to *that ancestor's own box*, not the viewport, regardless of how
 * many shadow boundaries sit between them. A live descendant that overflows
 * that bounded box (`overflow: visible` content wider or taller than the
 * transformed ancestor) can then paint outside `inset: 0`'s reach while
 * `Safe_T` still reports the scope `HELD`. Closing this soundly needs either
 * mounting the veil *outside* every host's own containing-block chain
 * (tracked per-scope bounding-rect synchronization the veil would then have
 * to stay pinned to, materially more machinery than this story's own
 * acceptance criteria call for) or a different primitive entirely for a
 * transformed/contained host — real, substantial work, not a small
 * follow-up, and one this comment specifically routes to whichever of
 * SF-OB (#1270, coverage observability over live scopes) or a dedicated
 * follow-up takes it on, rather than attempting a rushed, under-tested fix
 * in the middle of this story's own review cycle.
 *
 * *A second, narrower gap `reassert()` below closes*: `install()`'s
 * idempotency guard (`if (veil?.isConnected) return`) means a second call
 * never changes the veil's *position* in the tree, only its presence. CSS's
 * own tie-break rule for stacking contexts sharing a z-index is document
 * (tree) order — later wins — so a vendor element inserted *after* this
 * veil, sharing its own maximal `z-index`, would otherwise paint on top of
 * it indefinitely, `install()` notwithstanding. `reassert()` re-appends the
 * (already-installed) veil to the end of its mount point without touching
 * install/self-heal state, so a caller reacting to vendor mutations while a
 * scope stays held (SF-DC's `shadow-scope-discovery.ts`, #1267, where a
 * discovered scope never resolves past `HELD` — see that module's own
 * header) can keep winning the tie on every round rather than only at
 * registration time (bot-found, that story's own review).
 *
 * Zero imports: this file is injected standalone (compiled, unbundled) into
 * a bare test page by `tests/e2e/fixtures/scope-registry-harness.ts` to
 * prove the two-phase handoff and self-healing live in a browser, with no
 * dependency this module would need a module loader to resolve.
 */

import type { CustodyPrimitive, ScopeRef } from "./scope-registry"

/**
 * Exported (not just a module-private constant) so a per-scope reactive
 * observer watching the *same* node this hold is mounted under —
 * `shadow-scope-discovery.ts`'s per-root observer — can recognize this
 * element specifically, distinct from `data-my-ext`'s coarser "any
 * extension-owned node" test. Needed because Axiom 3.5's usual "removal is
 * never self-authored" rule (`pipeline.ts`'s `isSelfAuthored`, reused as-is
 * by that observer for genuine vendor evidence) is the wrong call for
 * *this* element specifically: this hold's own legitimate `release()` (the
 * second half of `scope-registry.ts`'s two-phase commit handoff) removes it
 * on purpose, and a caller reacting to that removal as if it were hostile
 * would invalidate the very commit it just watched succeed.
 */
export const HOLD_ATTR = "data-scope-registry-hold"

/** The node a hold is appended to and observed on: `documentElement` for the root document scope, the root itself for a shadow-root scope — there is no analogous "root element" to prefer over a `ShadowRoot` for the latter. */
function mountPointFor(ref: ScopeRef): Element | ShadowRoot {
  return ref instanceof Document ? ref.documentElement : ref
}

/** Per the DOM spec, `ownerDocument` is `null` only for a `Document` node itself — a `ShadowRoot`, detached or not, always carries the document that created it. */
function ownerDocumentFor(ref: ScopeRef): Document {
  return ref instanceof Document ? ref : ref.ownerDocument
}

/**
 * `CustodyPrimitive` plus `reassert()` — see this module's own header for
 * why the extra method exists and does not belong on the base interface
 * (every other `CustodyPrimitive` implementation, `document-scope.ts`'s
 * `createPrepaintCustody()` included, has no analogous stacking-order
 * concern to reassert).
 */
export type OcclusionHold = CustodyPrimitive & {
  /** Moves an already-installed veil back to being the last child of its mount point. A no-op if the veil is not currently installed — this never installs one itself. */
  reassert(): void
  /**
   * True when `node` is this hold's own veil element — checked by object
   * identity, never by any attribute the veil carries. A caller telling
   * this hold's own DOM churn apart from vendor mutations —
   * `shadow-scope-discovery.ts`'s per-root observer — must not identify it
   * by `HOLD_ATTR`/`data-my-ext`: those are public, page-discoverable
   * attributes a page (or an attribute-reconciling framework) can strip
   * without removing the element or changing its visible style, and doing
   * so previously broke identity recognition for every *later* mutation
   * on this same node — including this hold's own `reassert()` calls,
   * each of which (per the DOM's own pre-insert algorithm) generates a
   * remove-then-insert record pair even when moving an already-last-child
   * node, which would then itself fail an attribute-based check and be
   * read as fresh vendor evidence, triggering another `reassert()` and
   * repeating without bound (bot-found, #1267's own review, round 6). True
   * for a veil `release()` has already torn down, too — a caller reacting
   * to `release()`'s own removal runs as a queued microtask, after
   * `release()` has already nulled this closure's live veil reference, so
   * the check inside is against a `WeakSet` of every veil this hold has
   * ever created, not that mutable reference (a real regression this same
   * story's own test suite caught when the implementation first tried the
   * simpler `=== veil` comparison).
   */
  isOwnNode(node: Node): boolean
}

/**
 * The hold's own required visual style, factored out so the self-healing
 * observer below can compare against and restore exactly this string — see
 * `install()`'s own comment for why restoring *this*, not just presence, is
 * required. Every declaration carries `!important`: an inline `!important`
 * declaration outranks *any* author-origin stylesheet rule regardless of
 * that rule's own specificity or `!important` status (CSS Cascade's origin
 * ordering ties same-importance author declarations by specificity, and an
 * element's own inline style has no selector to be out-specificity'd by) —
 * without it, a shadow tree's own `<style>`/adopted stylesheet containing
 * so much as `div { display: none !important }` would silently defeat this
 * hold while the plain-string attribute comparison below still reports it
 * intact, since a stylesheet rule never touches the `style` attribute's own
 * text (bot-found, #1267's own review, round 6).
 *
 * `!important` only protects a property this string actually *declares* —
 * round 6's own first pass added `!important` to every property already
 * present here, but never added `display` in the first place, so an author
 * `div { display: none !important }` rule (the round's own cited example)
 * still won outright: there was no inline declaration for it to lose to.
 * Round 7 (still #1267's own review) caught that gap in the fix itself.
 * `display`/`visibility`/`opacity`/`width`/`height`/`transform` are the
 * standard "make an element invisible or collapse it" property set any
 * competent adversarial page reaches for; all six are pinned here now,
 * explicitly, to the values that keep this box a visible, full-viewport,
 * untransformed, opaque rectangle. `width`/`height` are pinned to `auto`,
 * not a fixed length — with `position: fixed` and all four `inset` offsets
 * constrained, `auto` is what makes CSS 2.1 §10.3.7's absolute-positioning
 * sizing rule compute the box to stretch across the full containing block,
 * which is the stretch-to-fill behavior this hold already relied on before
 * this string ever declared a `width`/`height` opinion at all — pinning
 * `auto` explicitly keeps that same behavior while also no longer leaving
 * the property undeclared for an author rule to fill in instead. This is a
 * defended, not exhaustive, set — `custody-primitive.ts`'s own header
 * already discloses the deeper containing-block gap (`transform`/`filter`/
 * `contain` on a *host or ancestor*, not this element) this string cannot
 * close by itself.
 */
const VEIL_STYLE =
  "position:fixed !important;inset:0 !important;z-index:2147483647 !important;" +
  "margin:0 !important;padding:0 !important;width:auto !important;" +
  "height:auto !important;display:block !important;visibility:visible !important;" +
  "opacity:1 !important;transform:none !important;" +
  "background-color:rgb(10,10,10) !important;pointer-events:none !important;"

/**
 * Creates an `OcclusionHold` scoped to `ref`. `install()`/`release()` are
 * both idempotent (Definition D.5's registry calls `install()` on every
 * transition requiring the hold engaged, including ones where it may
 * already be) and synchronous — there is never a round between calling
 * `install()` and the occlusion being live in the DOM.
 */
export function createOcclusionHold(ref: ScopeRef): OcclusionHold {
  const mount = mountPointFor(ref)
  const ownerDocument = ownerDocumentFor(ref)

  let veil: HTMLDivElement | null = null
  let observer: MutationObserver | null = null
  // Every element this hold has ever created via appendVeil(), tracked by
  // object identity (a WeakSet, so a since-discarded veil is still GC-able).
  // isOwnNode() below reads *this*, not the mutable `veil` variable: a
  // caller's MutationObserver callback reacting to release()'s own removal
  // runs as a queued microtask, by which point release() has already set
  // `veil = null` synchronously — comparing against the live variable would
  // read every one of that hold's own legitimate removal records as "not
  // mine" right when identity matters most (bot-found, #1267's own review,
  // round 6 — this exact regression surfaced in this story's own test suite
  // once isOwnNode replaced the old attribute-based check with `=== veil`).
  const ownedVeils = new WeakSet<Node>()

  function appendVeil(): HTMLDivElement {
    const el = ownerDocument.createElement("div")
    ownedVeils.add(el)
    el.setAttribute(HOLD_ATTR, "")
    // SF-DC (#1267): a per-root observer reacting to this same scope's own
    // mutations (shadow-scope-discovery.ts) must not mistake this veil's own
    // install()/self-heal churn for vendor evidence — the same Axiom 3.5
    // discipline prepaint.ts's own veil already carries (see that file's
    // PREPAINT_VEIL_ID element). Harmless for the document scope too: no
    // observer here reads `data-my-ext` today, but there is no reason for
    // this element to be missing the extension's own ownership tag either.
    el.setAttribute("data-my-ext", "")
    el.setAttribute("style", VEIL_STYLE)
    mount.appendChild(el)
    return el
  }

  return {
    install(): void {
      if (veil?.isConnected) return

      veil = appendVeil()

      // Self-healing: a hold an adversarial (or merely careless) page could
      // remove *or disable in place* is not a hold. Mirrors G0.6's own
      // spike and `prepaint-start.js`'s existing document-veil re-insertion
      // observer for removal; the `style`-repair half exists because a page
      // that locates this element by its own `data-my-ext`/`HOLD_ATTR`
      // marker (both public, discoverable attributes) and disables it in
      // place — `hold.style.display = "none"`, clearing the `style`
      // attribute outright — never removes it from the DOM, so the
      // removal-only watch above never fires, and `isSelfAuthored`
      // (`pipeline.ts`, reused by `shadow-scope-discovery.ts`'s per-root
      // observer) correctly-for-identity-purposes still recognizes the
      // mutation's target as extension-owned and does not react to it as
      // vendor evidence — leaving a disabled, still-connected veil that
      // this custody primitive alone is positioned to repair (bot-found,
      // #1267's own review).
      //
      // The removal check is `veil.parentNode !== mount`, not
      // `!veil.isConnected`: a page that *reparents* the veil into some
      // other still-connected element (a `display: none` wrapper, say)
      // rather than removing it outright leaves `isConnected` true
      // throughout, so that check alone never fires — `appendChild` moves
      // an already-connected node just as readily as it (re-)inserts a
      // detached one, so the same call repairs both cases uniformly
      // (bot-found, #1267's own review, round 5).
      if (observer === null) {
        observer = new MutationObserver((mutations) => {
          if (veil === null) return
          if (veil.parentNode !== mount) {
            mount.appendChild(veil)
            return
          }
          for (const record of mutations) {
            if (
              record.type === "attributes" &&
              record.target === veil &&
              record.attributeName === "style" &&
              veil.getAttribute("style") !== VEIL_STYLE
            ) {
              veil.setAttribute("style", VEIL_STYLE)
            }
          }
        })
        observer.observe(mount, { childList: true })
        observer.observe(veil, { attributes: true, attributeFilter: ["style"] })
      }
    },

    release(): void {
      observer?.disconnect()
      observer = null
      veil?.remove()
      veil = null
    },

    reassert(): void {
      if (veil?.isConnected) mount.appendChild(veil)
    },

    isOwnNode(node: Node): boolean {
      return ownedVeils.has(node)
    },
  }
}
