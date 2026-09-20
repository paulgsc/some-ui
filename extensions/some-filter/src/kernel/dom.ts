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
    if (!(node instanceof Element)) continue

    const nested = visit(node)
    if (nested !== null) yield* nested
  }
}

/**
 * Walks up from `element` while `predicate` holds, charging per link.
 *
 * The charge is the point. An ancestor walk is O(H_i) per element and
 * O(S_i x H_i) per pass, which is how the contrast channel reached 1.37
 * million style reads on a realistic page while every individual call site
 * looked innocuous. Charging per link makes that cost visible to the meter,
 * so a deep tree yields more often instead of blocking longer.
 */
export function* resolveAncestors<T>(
  element: Element,
  step: (current: Element) => Generator<number, T | null, void>
): Generator<number, T | null, void> {
  let current: Element | null = element

  while (current !== null) {
    yield COST.ancestorStep
    const resolved = yield* step(current)
    if (resolved !== null) return resolved
    current = current.parentElement
  }

  return null
}

/** Tags an element, charging the write. */
export function* writeAttribute(
  element: Element,
  name: string,
  value: string
): Generator<number, void, void> {
  yield COST.write
  element.setAttribute(name, value)
}
