/**
 * Adopts transport's Bootstrap (Definition D.2) and Session/Lifecycle
 * (Definition 5.4, Theorem D.1) for the prepaint veil.
 *
 * `public/prepaint.*`, installed at `document_start`, is "Bootstrap by
 * another name, discovered before the theory that named it" (canon §9.2).
 * This module does not replace `prepaint.ts`'s veil mechanics or
 * `prepaint-start.js`'s install; it gives the install/reset decision a
 * transport-shaped surface: Bootstrap's sentinel, and Theorem D.1's two
 * named reset paths. `content.ts` does not call it yet.
 *
 * The ownership signal (Remark 7.2) maps onto transport's `self-tag`
 * primitive *in addition to* `sw-dirty`: `sw-dirty` drives a pure-CSS
 * backstop that works before any JS observer runs. `reassertIfRemoved()` is
 * the JS-observable half.
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
   * case) and ensures the veil exists and is self-tagged. Idempotent because
   * each step is. Veil creation is deliberately not gated on the sentinel:
   * the two are tracked independently (Remark 7.2: the veil can go missing
   * while the sentinel does not), so `reassertIfRemoved()` can reuse this.
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
