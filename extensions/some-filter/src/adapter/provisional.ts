/**
 * Provisional darkening — acting on a new subtree before knowing anything
 * about it.
 *
 * Replaces the leading-edge *admission* pass, which read each new element's
 * vendor background and bound it to an already-committed `SurfaceKey`. That
 * design was measured against the real build and is not viable here:
 *
 *   getComputedStyle, steady style state    ~1 µs per element
 *   withVendorColorsVisible (one call)      ~6 ms   (two full-document
 *                                                    style recalcs)
 *
 * The reads were free; the suppression around them was the whole cost, it
 * is O(document) rather than O(added nodes), and it fell on *every mutation
 * batch* — the exact "Sensor cost scales with the vendor's churn rate"
 * profile #831 exists to have removed. Nothing about that is fixable by
 * tuning a budget, because the budget was throttling the microsecond and
 * leaving the millisecond unbounded.
 *
 * ## What replaces it, and why it can be free
 *
 * The extension's error is asymmetric. A surface painted dark that should
 * have been light is invisible on an already-dark page; a surface painted
 * light that should have been dark is the entire defect this extension
 * exists to prevent. So the two directions must not be paid for equally,
 * and in particular *being wrong toward dark need not be avoided at all*.
 *
 * That licenses acting before knowing. This module writes one attribute per
 * added subtree root and stops. It performs no style read, so it forces no
 * recalc; the attribute write invalidates style for a subtree the browser
 * was already going to lay out, so its marginal cost is the attribute
 * itself. Classification stays exactly where it was — in the debounced
 * round — and the round's verdict displaces the provisional fill when it
 * lands.
 *
 * ## The property worth more than the latency win
 *
 * Every bail-out reverses direction. Under the previous design, a budget
 * that ran out, a key not yet committed, a subtree over the node cap and a
 * batch arriving mid-churn all failed toward *light* — the expensive
 * direction. There is no such thing here, because there is nothing to bail
 * out of: marking is unconditional and O(1) per added root. What used to
 * be an incomplete accelerator is now a default, and the round is what
 * corrects it rather than what rescues it.
 *
 * This is also the honest answer to "there is no state `s` at which the
 * node graph has settled". There does not need to be. Settling only
 * mattered while being un-classified was unsafe.
 *
 * ## Known residual, deliberately accepted
 *
 * A *transparent element positioned over media* — a caption strip or a
 * play-button scrim over a thumbnail — becomes an opaque dark box for as
 * long as the provisional stands. It is the one false-dark that is not
 * free, and it is not structurally detectable: the element does not
 * contain the image, it overlaps it, so no `:has()` exclusion finds it.
 * Accepted rather than solved, on the grounds that it is bounded by one
 * reconcile round and that dark-over-media is the same class of wrongness
 * the asymmetry already licenses. If it ever shows up in real use, the
 * place to fix it is the rule in `theme-apply.ts`, not here.
 *
 * Note that media is not otherwise at risk: `background-color` paints
 * *beneath* `background-image`, so an element's own gradient or photo is
 * unaffected by the fill, and `<img>`/`<video>` content paints over their
 * own background box.
 */

// The XHTML namespace URI — a fixed DOM-spec identifier, never a resource
// fetched by anything; the http:// scheme is part of the spec's own literal
// string.
// eslint-disable-next-line no-restricted-syntax
const XHTML_NS = "http://www.w3.org/1999/xhtml"

/**
 * A private copy of `actuator.ts`'s own `isHTMLElementNode`, duplicated for
 * the reason that file already duplicates `isElementNode` from
 * `shadow-scope-discovery.ts`: `actuator.ts` needs to call
 * `clearAllProvisional()` from its `restore-native` branch, so this module
 * must not import from it. Two `nodeType`/`namespaceURI` checks are a
 * smaller price than restructuring the module graph, and the check is
 * realm-independent for the reason that file documents at length — an
 * element adopted from another realm fails `instanceof HTMLElement` while
 * being a perfectly real, connected element.
 */
function isElementNode(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE
}

function isHTMLElementNode(node: Node): node is HTMLElement {
  // Two steps, not one: `namespaceURI` is declared on `Element`, not `Node`.
  return isElementNode(node) && node.namespaceURI === XHTML_NS
}

/**
 * The provisional marker. Its value is the generation that wrote it — see
 * {@link clearProvisionalThrough} for why it is a number rather than an
 * empty attribute.
 *
 * Deliberately *not* `data-sw-patched`. That attribute means "the Actuator
 * decided this element's colour", is keyed to a real emitted rule, and is
 * what `shouldSkip` excludes from classification. A provisional mark
 * asserts nothing about the element's colour and must never make the
 * element invisible to the scan that is about to classify it.
 */
export const PROVISIONAL_ATTR = "data-sw-provisional"

/**
 * Marks each added root in `records`, returning how many were marked.
 *
 * Roots only: the CSS rule reaches descendants with a descendant
 * combinator, so one write covers a whole inserted subtree no matter how
 * large. This is the entire reason the pass is affordable on the critical
 * path — cost is O(added roots per batch), typically one or two, and never
 * O(nodes).
 *
 * `generation` is stamped as the value so a later round can clear exactly
 * the marks that existed when it sensed, and not the ones written while it
 * was running.
 *
 * Callers pass records already filtered through `isSelfAuthored`. The
 * canvas is excluded for the same reason the Actuator never tags it: the
 * static layer's `html, body { background: … }` rule owns it, and a
 * provisional fill would out-specify nothing but would still be a write
 * this module has no business making.
 */
export function markProvisional(
  records: ReadonlyArray<MutationRecord>,
  generation: number
): number {
  const stamp = String(generation)
  let marked = 0

  for (const record of records) {
    if (record.type !== "childList") continue
    if (record.addedNodes.length === 0) continue
    // Containment resolved once per record rather than once per added node.
    // Every node in a `childList` record shares the same parent, so one
    // O(depth) walk answers it for all of them — and on a page inserting
    // hundreds of nodes per batch, per-node `body.contains()` is the
    // difference between O(added) and O(added x depth) on the observer's
    // own microtask.
    const parent = record.target
    if (parent !== document.body && !document.body.contains(parent)) continue

    for (const node of record.addedNodes) {
      if (!isHTMLElementNode(node)) continue
      if (!node.isConnected) continue
      // Rendered content only, which means strictly *inside* `<body>`.
      //
      // Excludes the canvas for the reason the Actuator never tags it (the
      // static layer's `html, body` rule owns it), and excludes `<head>`,
      // which is otherwise a live hit: a vendor replacing `<html>`'s
      // children — the body/head swap `coverage-watchdog.ts` exists to
      // catch — reports `<head>` as an added node like any other, and it
      // passes every check an element-shaped filter can make. Marking it
      // paints nothing (a `<head>` has no box) but leaves a mark that
      // survives every teardown keyed on body content.
      // `<body>` and `<head>` are only ever reachable here when the record's
      // parent is `<html>`, which the per-record check above already
      // rejected — `document.body.contains(document.documentElement)` is
      // false. Kept as a direct guard anyway: it is one identity comparison,
      // and the alternative is relying on a non-obvious consequence of a
      // check fifteen lines away.
      if (node === document.body) continue
      // `[data-my-ext]` subtrees are ours; the guard in the CSS rule keeps
      // the fill off them regardless, but marking them would be a pointless
      // write on every veil/stylesheet insertion.
      if (node.hasAttribute("data-my-ext")) continue
      // Already marked by an earlier batch and not yet cleared — rewriting
      // the same attribute still queues a MutationRecord, and an unchanged
      // write is exactly the phantom evidence #831 was made of.
      if (node.getAttribute(PROVISIONAL_ATTR) === stamp) continue
      node.setAttribute(PROVISIONAL_ATTR, stamp)
      marked += 1
    }
  }

  return marked
}

/**
 * Removes every provisional mark stamped at or before `generation`.
 *
 * Called after a round has realized its verdict, so the fill is lifted only
 * once something authoritative has taken over. Marks written *after* the
 * round sensed carry a later generation and survive — otherwise a subtree
 * inserted between `scan()` and this call would lose its fill without ever
 * having been classified, which is the one way this mechanism could still
 * expose a light surface.
 *
 * Queried rather than tracked. Holding element references between rounds
 * would mean retaining detached nodes for the lifetime of a debounce window
 * on a page whose whole problem is that it churns; a single
 * `querySelectorAll` inside a round that already pays for an O(document)
 * tree walk is the cheaper and less leak-prone half of that trade.
 */
export function clearProvisionalThrough(generation: number): number {
  const marked = document.querySelectorAll(`[${PROVISIONAL_ATTR}]`)
  let cleared = 0
  for (const el of marked) {
    const stamp = Number(el.getAttribute(PROVISIONAL_ATTR))
    // NaN (a hand-edited or vendor-copied value) clears too: an
    // unattributable mark is one no round will ever take responsibility
    // for, and leaving it would strand the fill permanently.
    if (Number.isFinite(stamp) && stamp > generation) continue
    el.removeAttribute(PROVISIONAL_ATTR)
    cleared += 1
  }
  return cleared
}

/** Drops every provisional mark outright — mode exit and `restore-native`. */
export function clearAllProvisional(): boolean {
  const marked = document.querySelectorAll(`[${PROVISIONAL_ATTR}]`)
  for (const el of marked) el.removeAttribute(PROVISIONAL_ATTR)
  return marked.length > 0
}
