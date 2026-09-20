/**
 * The admission points: the only place in this extension permitted to touch
 * a page-affecting DOM primitive.
 *
 * ── why one module ───────────────────────────────────────────────────────
 *
 * `tests/budgets/effect-ledger.ts` declares one entry per primitive per
 * shipped bundle, and the admission gate ratchets the occurrence counts.
 * Before this module, those counts were spread across a dozen files —
 * `getComputedStyle` at 13 sites, `createTreeWalker` at 3 — which made the
 * ledger a census of call sites rather than a statement about behaviour.
 * Routing them through here collapses each to a single call site whose cost
 * class is enforced by the credit meter rather than asserted in a comment.
 *
 * That also makes the ratchet mean something sharper. A new call site of
 * `readStyle` is not interesting and does not move any count; a new *direct*
 * `getComputedStyle` anywhere in the extension raises the bundle's count
 * past its declared value and turns the gate red. The friction lands
 * exactly where it should: on bypassing the kernel, not on using it.
 *
 * ── what is charged, and why walking is not free ─────────────────────────
 *
 * Every function here charges credit for the work it causes, including the
 * work it causes *the engine*. `readStyle` charges `COST.styleRead` because
 * a computed-style read can force style resolution for that element;
 * `resolveAncestors` charges per link because an ancestor chain on a deep
 * tree is O(H_i) and is the single largest cost in the current classifier
 * (measured at 11.43 style reads per element for the contrast channel,
 * against 1.36 for the surface channel).
 *
 * A bare node visit is charged too, at a much lower weight. It looks free —
 * `TreeWalker.nextNode()` is cheap — but a pass that visits 120,000 nodes
 * doing nothing else still owns the main thread for as long as that takes,
 * and an uncharged operation is one the meter cannot bound.
 */

import { COST } from "./credit"
import type { BudgetedPass } from "./dispatch"

/**
 * Reads computed style, charging the dispatch for it.
 *
 * Generator rather than plain function: charging has to happen at a point
 * the driver can interrupt, and a `yield` is that point. Callers write
 * `const style = yield* readStyle(el)`, which reads like a call and is one.
 */
/**
 * Realm-independent element test. A local one-line `nodeType` check rather
 * than a shared import, matching the convention `actuator.ts` documents at
 * its own copy: the duplication is one line and the alternative is an
 * import edge from the kernel into the adapter layer.
 */
function isElementNode(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE
}

export function* readStyle(
  element: Element,
  pseudoElement?: string | null
): Generator<number, CSSStyleDeclaration, void> {
  yield COST.styleRead
  return getComputedStyle(element, pseudoElement)
}

/**
 * Walks `root`'s descendants, yielding each element to the caller's `visit`
 * and charging per visit.
 *
 * `root` accepts a `ShadowRoot` as well as an `Element`, matching the
 * scope-agnostic contract the existing `scan()` documents: the walker only
 * ever touches the *walked* nodes, which `SHOW_ELEMENT` guarantees are
 * elements regardless of what kind of node the root is.
 *
 * The walk itself is not restartable from an index — a `TreeWalker` holds
 * its own cursor, and this generator holds the walker, so suspending the
 * generator suspends the walk exactly where it stopped. That is why the
 * pass is a generator rather than a callback loop with a saved offset: the
 * DOM may have changed under us between tasks, and a `TreeWalker` handles
 * that by its own documented semantics instead of by index arithmetic on a
 * snapshot that has gone stale.
 */
export function* walkSubtree(
  root: Element | ShadowRoot,
  visit: (element: Element) => BudgetedPass<void> | null
): BudgetedPass<void> {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)

  for (;;) {
    yield COST.visit
    const node = walker.nextNode()
    if (node === null) return
    // `nodeType`, never `instanceof Element`. An element adopted from a
    // different realm fails `instanceof` while being a perfectly real
    // element, and this codebase has already been bitten by exactly that
    // (see `actuator.ts`'s `isHTMLElementNode`, and the cross-realm case in
    // `legibility-audit.test.ts` that caught an `instanceof` guard here
    // silently dropping such a node from the scan). `SHOW_ELEMENT` already
    // guarantees what this narrows to; the check exists only to carry that
    // guarantee into the type system without an assertion.
    if (!isElementNode(node)) continue

    const nested = visit(node)
    if (nested !== null) yield* nested
  }
}

/*
 * There is deliberately no `resolveAncestors` helper here. Both ancestor
 * walks in this extension (`isRenderedBudgeted`, `resolveEffectiveBackdropBudgeted`)
 * cross shadow boundaries via `parentNode.host` when `parentElement` runs
 * out, which a `parentElement`-only helper cannot express — it would have
 * silently stopped at each shadow root. They charge `COST.ancestorStep`
 * in place instead. An abstraction that does not fit either caller is worse
 * than none.
 */

/** Tags an element, charging the write. */
export function* writeAttribute(
  element: Element,
  name: string,
  value: string
): Generator<number, void, void> {
  yield COST.write
  element.setAttribute(name, value)
}

/**
 * `Element.closest`, charged per ancestor link.
 *
 * `closest` looks like a single cheap call and is O(H_i); the classifier
 * calls it once per element from two separate guards (`shouldSkip`,
 * `isExtensionOwned`), which makes those guards O(S_i x H_i) across a pass
 * — the same shape as the ancestor walk that dominates the contrast
 * channel, and just as invisible at the call site.
 *
 * The charge is an estimate rather than a count: the engine does the walk
 * internally, so there is no per-link hook. Charging the element's actual
 * depth would need a second walk to measure it, which costs more than it
 * saves, so this charges a flat `ancestorStep` — correct in shape, and
 * deliberately conservative only in the sense that a very deep tree is
 * undercharged. The e2e canary is the falsifier if that ever matters.
 */
export function* closestMatch(
  element: Element,
  selector: string
): Generator<number, Element | null, void> {
  yield COST.ancestorStep
  return element.closest(selector)
}
