/**
 * Interaction-state cancellation — marking the innermost hovered element so
 * the static layer can cancel a vendor `:hover` background on it.
 *
 * ## Why this is JS at all, when it was one CSS rule
 *
 * The rule it replaces was
 * `:hover:not(:has(:hover)):not([data-sw-patched])…`. The `:has()` half
 * selects the *innermost* hovered element, which is the one that matters:
 * without it every ancestor up to `<body>` matches, since the pointer is
 * inside all of them, and the cancellation blanks the whole page on any
 * pointer movement.
 *
 * That is a document-wide `:has()` whose argument is a *dynamic
 * pseudo-class*. Every pointer move crossing an element boundary makes the
 * engine re-evaluate it up the ancestor chain, and Gecko's `:has()`
 * invalidation is ancestor-scoped rather than element-scoped. It was the
 * only construct in this extension costing work per *input event* rather
 * than per mutation batch, it shipped, and it was reported hanging Firefox
 * — with the browser's own "this extension is slowing down Firefox" notice
 * naming it. It could not be reproduced in this project's Chromium
 * harness, whose `:has()` invalidation is far better optimised; that is a
 * statement about the harness, not a defence of the selector.
 *
 * The event model already knows the answer. `pointerover`'s `event.target`
 * *is* the innermost element under the pointer — that is what the DOM means
 * by a target — so the selector was asking the style engine, document-wide
 * and on every pointer move, a question the dispatch already resolved in
 * O(1). This module writes one attribute to that element and clears it from
 * the previous one; invalidation is two elements, and no selector anywhere
 * contains a dynamic pseudo-class.
 *
 * ## Its own module, not a few lines in the Sensor
 *
 * `pipeline.ts` is the Sensor, and `actuator.test.ts` asserts structurally
 * that it performs no DOM writes at all — a real invariant, not a style
 * rule, and this would have been the first exception to it. So the writes
 * live here, the Sensor calls in, and the assertion stays exactly as
 * strict as it was.
 */

import { isHTMLElementNode } from "./actuator"
import { PROVISIONAL_ATTR } from "./provisional"

/** The marker the static layer's interaction-cancellation rule keys on. */
export const HOVER_CANCEL_ATTR = "data-sw-hover-cancel"

export type HoverCancel = {
  /** Marks `node` if it is eligible, clearing whatever was marked before. */
  mark(node: Node | null): void
  /** Clears the current mark, if any. */
  clear(): void
}

/**
 * At most one element is ever marked, which is the bound the whole design
 * rests on: cancellation costs two attribute writes per pointer transition,
 * and the reference is held so clearing needs no query.
 *
 * `HOVER_CANCEL_ATTR` sits outside the Sensor's
 * `attributeFilter: ["class", "style"]`, so these writes queue no mutation
 * records and cannot schedule a round — otherwise moving the pointer would
 * drive the reconcile loop, which is #831 with a mouse.
 */
export function createHoverCancel(): HoverCancel {
  let marked: HTMLElement | null = null

  const clear = (): void => {
    if (marked === null) return
    marked.removeAttribute(HOVER_CANCEL_ATTR)
    marked = null
  }

  return {
    clear,
    mark(node: Node | null): void {
      if (node === null || !isHTMLElementNode(node)) {
        clear()
        return
      }
      // Re-entering the same element (a `pointerover` for a descendant that
      // bubbled, a repeated move within one box) must not churn the
      // attribute: an unchanged write is still an invalidation.
      if (node === marked) return
      clear()
      // The Actuator's verdict is the authority wherever one exists, and a
      // provisionally filled element must keep its fill — cancelling there
      // would re-expose exactly what the fill is hiding.
      if (node.hasAttribute("data-sw-patched")) return
      if (node.hasAttribute(PROVISIONAL_ATTR)) return
      node.setAttribute(HOVER_CANCEL_ATTR, "")
      marked = node
    },
  }
}
