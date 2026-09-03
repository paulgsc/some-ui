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
}

/**
 * Creates an `OcclusionHold` scoped to `ref`. `install()`/`release()` are
 * both idempotent (Definition D.5's registry calls `install()` on every
 * transition requiring the hold engaged, including ones where it may
 * already be) and synchronous — there is never a round between calling
 * `install()` and the occlusion being live in the DOM.
 */
/**
 * The hold's own required visual style, factored out so the self-healing
 * observer below can compare against and restore exactly this string — see
 * `install()`'s own comment for why restoring *this*, not just presence, is
 * required.
 */
const VEIL_STYLE =
  "position:fixed;inset:0;z-index:2147483647;margin:0;padding:0;" +
  "background-color:rgb(10,10,10);pointer-events:none;"

export function createOcclusionHold(ref: ScopeRef): OcclusionHold {
  const mount = mountPointFor(ref)
  const ownerDocument = ownerDocumentFor(ref)

  let veil: HTMLDivElement | null = null
  let observer: MutationObserver | null = null

  function appendVeil(): HTMLDivElement {
    const el = ownerDocument.createElement("div")
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
      if (observer === null) {
        observer = new MutationObserver((mutations) => {
          if (veil === null) return
          if (!veil.isConnected) {
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
  }
}
