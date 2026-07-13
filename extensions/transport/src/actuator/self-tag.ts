/**
 * Definition 7.3 (Self-tag), Remark 7.2 (Bidirectional self-tagging) —
 * canon §7.
 *
 * A channel-visible marker attached to every actuator-authored node,
 * checked at two points: by any detector sampling the subtree (to exclude
 * self-authored evidence, Axiom 3.5 / Proposition 7.3), and by the
 * estimator's own ingestion path (to recognize an echo of its own write,
 * Theorem 7.2). The *ownership signal* is a second, distinct marker
 * (Remark 7.2): a self-tag alone answers "did I write this," not "was
 * this just removed, by me or by the vendor" — the ownership signal,
 * cleared only by `releaseOwnership()`'s intentional teardown, answers
 * that.
 */

const SELF_TAG_ATTR = "data-transport-actuator"
const OWNERSHIP_ATTR = "data-transport-owned"

/** Self-tags `element` and marks it owned. Idempotent: re-tagging with the same value is a no-op on observable state. */
export function tag(element: Element, tagValue: string): void {
  element.setAttribute(SELF_TAG_ATTR, tagValue)
  element.setAttribute(OWNERSHIP_ATTR, "true")
}

export function isSelfTagged(element: Element): boolean {
  return element.hasAttribute(SELF_TAG_ATTR)
}

export function selfTagValue(element: Element): string | undefined {
  return element.getAttribute(SELF_TAG_ATTR) ?? undefined
}

/**
 * Marks intentional teardown. Must be called *before* an actuator-driven
 * removal — a later `wasRemovedByVendor`/`wasRemovedByUs` check on the
 * same (now possibly detached) element reference distinguishes the two
 * only because this function is the sole way the ownership flag clears.
 */
export function releaseOwnership(element: Element): void {
  element.removeAttribute(OWNERSHIP_ATTR)
  element.removeAttribute(SELF_TAG_ATTR)
}

export function wasOwned(element: Element): boolean {
  return element.hasAttribute(OWNERSHIP_ATTR)
}

/**
 * True if a tracked, disconnected element was removed by the vendor's own
 * process rather than by the actuator's own teardown — the ownership flag
 * is still present because `releaseOwnership()` was never called before
 * disconnection. Precondition: `element` was previously tagged via `tag()`.
 */
export function wasRemovedByVendor(element: Element): boolean {
  return !element.isConnected && wasOwned(element)
}

/**
 * True if a tracked, disconnected element was removed via the actuator's
 * own intentional teardown — `releaseOwnership()` cleared the flag before
 * disconnection. Precondition: `element` was previously tagged via `tag()`.
 */
export function wasRemovedByUs(element: Element): boolean {
  return !element.isConnected && !wasOwned(element)
}
