/**
 * Node classification (BC2, #1435) — the one place a freshly observed node
 * is turned into "a card anchored here", "not a card", "a shell that might
 * become one", or "a shape the layout table does not know" (B4).
 *
 * Two questions, two sources:
 *
 *   1. *Is this element a card right now?* — the catalogue's own predicate
 *      (`classifyCard`: card / container / shell / none), which is the same
 *      condition the pre-mask stylesheet spells, so what the Sensor adopts
 *      and what the occluder hides cannot disagree.
 *   2. *Does the layout table know this shape?* — `classifyShape` over
 *      (surface, tag, card verdict, enclosing tag). The table decides what
 *      the relationship *means*; the Sensor merely confirms the relationship
 *      with one bounded `closest()` against the **whole** catalogue from the
 *      parent — never only the parents the table declares, which would hide
 *      a parent YouTube adds after the crawl (#1505's own review). That is
 *      the only structural walk in the runtime path, it is one call deep,
 *      and it exists so the table can be told when it is wrong
 *      (`unexpected-outer`, `nested-without-outer`): a Sensor that trusted
 *      the table blindly could never detect the drift #1434's recrawl
 *      cadence is keyed to. The verdict from (1) travels with the question,
 *      so the table is never asked to place an ad slot or a container.
 *
 * Pure with respect to everything but the node it is handed.
 */

import type { UnknownShapeReason } from "@censor/lib/content/layout/lookup"
import { classifyShape } from "@censor/lib/content/layout/lookup"
import type { LayoutTable } from "@censor/lib/content/layout/schema"
import type { BoyoSurface } from "@censor/lib/content/layout/surface"
import { classifyCard, SEL } from "@censor/lib/content/selectors"
import { assertNever } from "@some-extension/common"

export type NodeClass =
  /** A card, and the table knows its shape. */
  | { readonly kind: "card"; readonly shape: "known" }
  /**
   * A card the table could not place (B4). Still adopted — the stylesheet
   * is occluding it regardless, and a veil is strictly better than an
   * occluder nothing lifts — and counted.
   */
  | {
      readonly kind: "card"
      readonly shape: "unknown"
      readonly reason: UnknownShapeReason
    }
  /** A catalogue tag with no video link yet: queue it, under the budget. */
  | { readonly kind: "shell" }
  /** A container of other cards, or not a catalogue tag at all. */
  | { readonly kind: "not-card" }

export function classifyNode(
  el: HTMLElement,
  surface: BoyoSurface,
  table: LayoutTable
): NodeClass {
  const card = classifyCard(el)
  const tag = el.tagName.toLowerCase()
  // Walked only for a card: a container or shell is answered by the verdict
  // alone, and a non-catalogue element has nothing to confirm.
  const enclosing =
    card === "card" ? (el.parentElement?.closest(SEL) ?? null) : null
  const outer = enclosing === null ? null : enclosing.tagName.toLowerCase()
  const shape = classifyShape(table, surface, { tag, card, outer })
  switch (shape.kind) {
    case "anchor":
    case "nested": {
      // The table has seen this tag here, in this context. Whether it called
      // the occurrence an anchor or nested is the *table's* description of
      // the crawl; which element gets the veil is the catalogue predicate's
      // decision (a container is never a card), already made above.
      return { kind: "card", shape: "known" }
    }
    case "container":
    case "not-card": {
      return { kind: "not-card" }
    }
    case "shell": {
      return { kind: "shell" }
    }
    case "unknown": {
      return { kind: "card", shape: "unknown", reason: shape.reason }
    }
    default: {
      shape satisfies never
      return assertNever(shape)
    }
  }
}
