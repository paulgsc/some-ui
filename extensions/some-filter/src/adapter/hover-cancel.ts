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
 * The marked chain is held, not queried, and the next chain is diffed
 * against it: consecutive events inside one row share almost all of it, so
 * the steady-state cost is one or two attribute writes per pointer
 * transition regardless of depth.
 *
 * `HOVER_CANCEL_ATTR` sits outside the Sensor's
 * `attributeFilter: ["class", "style"]`, so these writes queue no mutation
 * records and cannot schedule a round — otherwise moving the pointer would
 * drive the reconcile loop, which is #831 with a mouse.
 */
/**
 * How far up the hovered chain to reach.
 *
 * `:hover` matches every ancestor of the pointer's element, so the element a
 * vendor's hover rule actually restyles is rarely the event target — on
 * `<div class="row"><span>text</span></div>`, `.row:hover` is what turns
 * white and `event.target` is the `<span>`. An earlier version of this
 * marked the target alone and therefore cancelled nothing on any page whose
 * rows contain markup, which is all of them. Its e2e test passed only
 * because the fixture's row held bare text, making target and row the same
 * element.
 *
 * Bounded rather than climbing to `<body>` because the cost is per pointer
 * event and the depth of a vendor's DOM is not this extension's to trust.
 * Eight is past every realistic row/cell/label nesting and far short of the
 * 30+ levels a framework wrapper stack can reach.
 */
const CHAIN_DEPTH = 8

export function createHoverCancel(): HoverCancel {
  let marked: ReadonlyArray<HTMLElement> = []

  const clear = (): void => {
    for (const el of marked) el.removeAttribute(HOVER_CANCEL_ATTR)
    marked = []
  }

  return {
    clear,
    mark(node: Node | null): void {
      if (node === null || !isHTMLElementNode(node)) {
        clear()
        return
      }

      const next: Array<HTMLElement> = []
      let el: HTMLElement | null = node
      for (let depth = 0; el !== null && depth < CHAIN_DEPTH; depth += 1) {
        if (el === document.body) break
        // The Actuator's verdict is the authority wherever one exists, and a
        // provisionally filled element must keep its fill — cancelling
        // either would re-expose exactly what they are there to hide. Skip
        // them but keep climbing: an untagged ancestor above a tagged one
        // can still carry a vendor hover background.
        if (
          !el.hasAttribute("data-sw-patched") &&
          !el.hasAttribute(PROVISIONAL_ATTR)
        ) {
          next.push(el)
        }
        const parent: Element | null = el.parentElement
        el = parent !== null && isHTMLElementNode(parent) ? parent : null
      }

      // Diffed, not rewritten. Consecutive `pointerover`s inside one row
      // share almost their whole chain, so this is one or two attribute
      // writes per event rather than `CHAIN_DEPTH` of them — and an
      // unchanged write is still a style invalidation, which at pointer-move
      // frequency is the difference that matters.
      for (const previous of marked) {
        if (!next.includes(previous))
          previous.removeAttribute(HOVER_CANCEL_ATTR)
      }
      for (const current of next) {
        if (!marked.includes(current)) {
          current.setAttribute(HOVER_CANCEL_ATTR, "")
        }
      }
      marked = next
    },
  }
}
