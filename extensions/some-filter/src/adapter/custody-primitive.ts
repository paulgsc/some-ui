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
 * every pixel any live descendant of the scope could paint, registered or
 * not, satisfying the boundary-crossing argument Theorem D.3's inductive
 * step and Corollary D.3.1 both rely on — deliberately the coarsest, most
 * conservative instance of the primitive (canon: "on uncertainty, hold the
 * whole affected scope — false-positive custody... [is an] admissible
 * cost"), not a per-scope-bounded mask.
 *
 * Zero imports: this file is injected standalone (compiled, unbundled) into
 * a bare test page by `tests/e2e/fixtures/scope-registry-harness.ts` to
 * prove the two-phase handoff and self-healing live in a browser, with no
 * dependency this module would need a module loader to resolve.
 */

import type { CustodyPrimitive, ScopeRef } from "./scope-registry"

const HOLD_ATTR = "data-scope-registry-hold"

/** The node a hold is appended to and observed on: `documentElement` for the root document scope, the root itself for a shadow-root scope — there is no analogous "root element" to prefer over a `ShadowRoot` for the latter. */
function mountPointFor(ref: ScopeRef): Element | ShadowRoot {
  return ref instanceof Document ? ref.documentElement : ref
}

/** Per the DOM spec, `ownerDocument` is `null` only for a `Document` node itself — a `ShadowRoot`, detached or not, always carries the document that created it. */
function ownerDocumentFor(ref: ScopeRef): Document {
  return ref instanceof Document ? ref : ref.ownerDocument
}

/**
 * Creates a `CustodyPrimitive` scoped to `ref`. `install()`/`release()` are
 * both idempotent (Definition D.5's registry calls `install()` on every
 * transition requiring the hold engaged, including ones where it may
 * already be) and synchronous — there is never a round between calling
 * `install()` and the occlusion being live in the DOM.
 */
export function createOcclusionHold(ref: ScopeRef): CustodyPrimitive {
  const mount = mountPointFor(ref)
  const ownerDocument = ownerDocumentFor(ref)

  let veil: HTMLDivElement | null = null
  let observer: MutationObserver | null = null

  function appendVeil(): HTMLDivElement {
    const el = ownerDocument.createElement("div")
    el.setAttribute(HOLD_ATTR, "")
    el.setAttribute(
      "style",
      "position:fixed;inset:0;z-index:2147483647;margin:0;padding:0;" +
        "background-color:rgb(10,10,10);pointer-events:none;"
    )
    mount.appendChild(el)
    return el
  }

  return {
    install(): void {
      if (veil?.isConnected) return

      veil = appendVeil()

      // Self-healing: a hold an adversarial (or merely careless) page could
      // remove is not a hold. Mirrors G0.6's own spike and
      // `prepaint-start.js`'s existing document-veil re-insertion observer.
      if (observer === null) {
        observer = new MutationObserver(() => {
          if (veil !== null && !veil.isConnected) {
            mount.appendChild(veil)
          }
        })
        observer.observe(mount, { childList: true })
      }
    },

    release(): void {
      observer?.disconnect()
      observer = null
      veil?.remove()
      veil = null
    },
  }
}
