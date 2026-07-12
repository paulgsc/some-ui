/**
 * Theorem D.1 (Bootstrap persistence), Corollary D.1.1 — canon §D.0.
 *
 * Wires the two reset paths Theorem D.1 distinguishes:
 *
 * - `teardownContent()` ends the content lifetime L_C without touching
 *   Bootstrap — case (a), a same-document (SPA) navigation. Paired with a
 *   fresh content-session init and Session's `resetContent()` (S3), this
 *   is the SPA-nav path.
 * - `teardownDocument()` additionally tears down Bootstrap itself — case
 *   (b), a refresh. Paired with a Bootstrap reinstall and Session's
 *   `resetDocument()`, this is the refresh path.
 *
 * This module owns no concrete resource itself: `disposables` is a
 * caller-supplied registry of every disposable a content session created
 * (MutationObserver disconnects, event-listener removals, Scheduler
 * timers) — Lifecycle only sequences their disposal against Session's
 * reset, never reaches into Sensor/Estimator/Scheduler internals directly.
 */

import type { SessionLifecycle } from "../session/lifecycle"

export type Disposable = () => void

/** Disposes every resource the ending content session owns, then advances the epoch without touching Bootstrap (Theorem D.1(a)). */
export function teardownContent(
  disposables: ReadonlyArray<Disposable>,
  session: SessionLifecycle
): void {
  for (const dispose of disposables) {
    dispose()
  }
  session.resetContent()
}

/** As `teardownContent()`, plus tearing down Bootstrap itself (Theorem D.1(b)). */
export function teardownDocument(
  disposables: ReadonlyArray<Disposable>,
  session: SessionLifecycle,
  teardownBootstrap: () => void
): void {
  for (const dispose of disposables) {
    dispose()
  }
  teardownBootstrap()
  session.resetDocument()
}
