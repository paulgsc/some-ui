/**
 * Adopts transport's Bootstrap (Definition D.2) and Session/Lifecycle
 * (Definition 5.4, Theorem D.1) for `some-filter`'s prepaint veil — S4 of
 * the some-filter-on-transport epic (#685, #689).
 *
 * `public/prepaint.*`, installed at `document_start` and independent of
 * classification, is "Bootstrap by another name, discovered before the
 * theory that named it" (canon §9.2). This module does not replace
 * `prepaint.ts`'s veil mechanics (still the only thing that creates or
 * removes the actual DOM element) or `prepaint-start.js`'s document_start
 * install (out of scope — that is the raw anti-flash critical path and is
 * untouched by this story); it gives the *install/reset* decision a
 * transport-shaped surface — Bootstrap's sentinel instead of an implicit
 * "call enablePrepaint() and hope," and the two named reset paths Theorem
 * D.1 distinguishes instead of `content.ts`'s ad-hoc `sessionStorage` +
 * `yt-navigate-finish` handling. `content.ts` itself is not rewired to call
 * this module yet — that wiring is S5's ("no per-surface actuation (S5)").
 *
 * The ownership signal (Remark 7.2) is mapped onto transport's `self-tag`
 * primitive (`wasRemovedByVendor`/`wasRemovedByUs`) *in addition to*, not
 * instead of, `prepaint.ts`'s own `sw-dirty` class: `sw-dirty` drives a
 * pure-CSS backstop (`html.sw-dirty > body { background: #000 }`) that
 * works even before any JS observer runs, which self-tag's data attributes
 * cannot replace. `reassertIfRemoved()` below is the JS-observable half —
 * the pure decision transport's self-tag makes checkable without a live
 * MutationObserver.
 */

import {
  disablePrepaint,
  enablePrepaint,
  PREPAINT_VEIL_ID,
} from "@filter/lib/content/prepaint"
import {
  releaseOwnership,
  tag,
  wasRemovedByUs,
  wasRemovedByVendor,
} from "@some-extension/transport/actuator/self-tag"
import * as bootstrapLayer from "@some-extension/transport/bootstrap/static"
import {
  teardownContent,
  teardownDocument,
} from "@some-extension/transport/lifecycle/teardown"
import type { Disposable } from "@some-extension/transport/lifecycle/teardown"
import {
  createSessionLifecycle,
  type SessionLifecycle,
} from "@some-extension/transport/session/lifecycle"

const OWNERSHIP_TAG_VALUE = "prepaint-veil"

export type FilterBootstrap = {
  readonly session: SessionLifecycle

  /**
   * Installs Bootstrap's sentinel on `root` (Corollary D.1.1's day-zero
   * case) and ensures the veil exists and is self-tagged. Idempotent as a
   * whole because each step it composes already is: `bootstrapLayer.install`
   * no-ops once a sentinel exists, `enablePrepaint` no-ops once a veil
   * exists, `tag` no-ops when re-applying the same value. Deliberately does
   * *not* gate veil creation on "was Bootstrap already installed" — the
   * sentinel and the veil element are tracked independently (Remark 7.2's
   * whole point is that the veil can go missing while the sentinel does
   * not), so `reassertIfRemoved()` below can call this same `install()`
   * after a vendor removes only the veil and still get it back.
   */
  install(): void

  /** Theorem D.1(a): same-document (SPA) navigation. Bootstrap, and the veil, are untouched — only the content epoch advances. */
  resetContent(disposables?: ReadonlyArray<Disposable>): void

  /** Theorem D.1(b): refresh. Disposes the content session, releases and removes the veil, uninstalls the sentinel, and advances the epoch. A subsequent `install()` reinstalls fresh. */
  resetDocument(disposables?: ReadonlyArray<Disposable>): void

  /** Remark 7.2: re-installs iff the tracked veil was disconnected by the vendor rather than by this module's own `resetDocument()`. No-op before the first `install()`. */
  reassertIfRemoved(): void
}

export function createFilterBootstrap(
  root: Element = document.documentElement
): FilterBootstrap {
  const session = createSessionLifecycle()
  let trackedVeil: Element | null = null

  function currentVeil(): Element | null {
    return root.ownerDocument.getElementById(PREPAINT_VEIL_ID)
  }

  function install(): void {
    bootstrapLayer.install(root)
    enablePrepaint()

    const veil = currentVeil()
    if (veil !== null) {
      tag(veil, OWNERSHIP_TAG_VALUE)
    }
    trackedVeil = veil
  }

  function teardownBootstrap(): void {
    if (trackedVeil !== null) {
      releaseOwnership(trackedVeil)
    }
    disablePrepaint()
    bootstrapLayer.uninstall(root)
    trackedVeil = null
  }

  return {
    session,

    install,

    resetContent(disposables: ReadonlyArray<Disposable> = []): void {
      teardownContent(disposables, session)
    },

    resetDocument(disposables: ReadonlyArray<Disposable> = []): void {
      teardownDocument(disposables, session, teardownBootstrap)
    },

    reassertIfRemoved(): void {
      if (trackedVeil !== null && wasRemovedByVendor(trackedVeil)) {
        install()
      }
    },
  }
}

export { wasRemovedByUs, wasRemovedByVendor }
