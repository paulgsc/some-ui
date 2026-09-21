/**
 * Reading the layout table (BC1, #1434): the questions a Sensor asks of it,
 * answered from data alone.
 *
 * Pure. Nothing here touches a node; the Sensor (BC2) supplies what it
 * observed — the tag, `classifyCard()`'s verdict on the element, and the
 * enclosing catalogue tag it *confirmed* — and gets back a classification,
 * including the explicit "I do not know" the Boundary Contract's B4 requires
 * be a state rather than an exception.
 *
 * Two rules the arguments encode, both bot-found (#1505's own review):
 *
 *   - The table describes *shape* (how catalogue tags sit on a surface), not
 *     card-ness. A top-level `ytd-rich-item-renderer` may be an ad slot, a
 *     skeleton, or a cell wrapping a `yt-lockup-view-model`; the checked-in
 *     home fingerprint records exactly that (6 rich items, 5 with a video
 *     link). So {@link classifyShape} takes `classifyCard()`'s verdict and
 *     only consults the table for a `"card"` — `anchor` is unreachable
 *     without the polymorphic guard the pre-mask stylesheet also spells.
 *   - `outer` must be the nearest enclosing catalogue tag found with
 *     `closest()` over the **whole** catalogue — the same walk the fingerprint
 *     performs — never over the parents the table already declares. A
 *     lookup directed only at declared parents would report `null` for a
 *     parent YouTube introduced after the crawl, and a tag with an anchor
 *     shape would then be accepted as one: the very drift this table's
 *     `unknown_shape` counter exists to surface, made invisible.
 */

import type { CardKind } from "@censor/lib/content/selectors"
import { assertNever } from "@some-extension/common"

import { LAYOUT_SCHEMA_VERSION } from "./schema"
import type { LayoutTable, SurfaceLayout } from "./schema"
import type { BoyoSurface } from "./surface"

/** Whether a Sensor built against this module can read a given table. */
export type TableStatus =
  | { readonly kind: "current" }
  /** Content is well-formed, but its schema is one this reader predates. */
  | {
      readonly kind: "unknown-schema"
      readonly found: number
      readonly expected: number
    }

export function tableStatus(table: LayoutTable): TableStatus {
  return table.schemaVersion === LAYOUT_SCHEMA_VERSION
    ? { kind: "current" }
    : {
        kind: "unknown-schema",
        found: table.schemaVersion,
        expected: LAYOUT_SCHEMA_VERSION,
      }
}

/** Where a surface's answer came from. */
export type LayoutResolution =
  | { readonly kind: "crawled"; readonly layout: SurfaceLayout }
  /** The surface was never crawled; the union of every crawled one stands in. */
  | { readonly kind: "fallback"; readonly layout: SurfaceLayout }
  | { readonly kind: "none" }

export function resolveSurface(
  table: LayoutTable,
  surface: BoyoSurface
): LayoutResolution {
  const crawled = table.surfaces[surface]
  if (crawled !== undefined) return { kind: "crawled", layout: crawled }
  const union = table.surfaces["*"]
  if (union !== undefined) return { kind: "fallback", layout: union }
  return { kind: "none" }
}

/** What the Sensor observed about one element, as data. */
export type ObservedNode = {
  readonly tag: string
  /** `classifyCard()`'s verdict — the polymorphic guard, made a parameter. */
  readonly card: CardKind
  /**
   * The nearest enclosing catalogue tag, confirmed with `closest()` over the
   * whole catalogue, or `null` when there is none.
   */
  readonly outer: string | null
}

/**
 * What a freshly observed node is, per the table.
 *
 * `unknown` carries a reason so the recrawl signal (#1434's cadence, #1435's
 * counter) can say *which* kind of drift it is seeing, not merely that
 * something did not match.
 */
export type ShapeClassification =
  | { readonly kind: "anchor" }
  | { readonly kind: "nested"; readonly outer: string }
  /** A catalogue tag wrapping another catalogue card: the inner one is the card. */
  | { readonly kind: "container" }
  /** A catalogue tag with no video link yet. */
  | { readonly kind: "shell" }
  /** Not a catalogue tag at all — nothing the extension tracks. */
  | { readonly kind: "not-card" }
  | { readonly kind: "unknown"; readonly reason: UnknownShapeReason }

export type UnknownShapeReason =
  /** No layout for this surface, and no union to fall back on. */
  | "surface-uncrawled"
  /** A catalogue tag the crawl never saw on this surface. */
  | "tag-unseen"
  /** The crawl saw this tag only nested, and here it has no enclosing card. */
  | "nested-without-outer"
  /** The crawl never saw this tag inside this particular outer tag. */
  | "unexpected-outer"

/**
 * Classify one observed node against the table.
 *
 * The card verdict is answered first and without the table: a container,
 * shell, or non-catalogue element is what `classifyCard()` said it is,
 * whatever shapes the table holds. Only a `"card"` is placed by shape.
 */
export function classifyShape(
  table: LayoutTable,
  surface: BoyoSurface,
  node: ObservedNode
): ShapeClassification {
  switch (node.card) {
    case "none": {
      return { kind: "not-card" }
    }
    case "container": {
      return { kind: "container" }
    }
    case "shell": {
      return { kind: "shell" }
    }
    case "card": {
      break
    }
    default: {
      return assertNever(node.card)
    }
  }

  const resolved = resolveSurface(table, surface)
  if (resolved.kind === "none") {
    return { kind: "unknown", reason: "surface-uncrawled" }
  }

  const seen = resolved.layout.shapes.filter((s) => s.tag === node.tag)
  if (seen.length === 0) return { kind: "unknown", reason: "tag-unseen" }

  if (node.outer === null) {
    return seen.some((s) => s.role === "anchor")
      ? { kind: "anchor" }
      : { kind: "unknown", reason: "nested-without-outer" }
  }

  const outer = node.outer
  return seen.some((s) => s.role === "nested" && s.outer === outer)
    ? { kind: "nested", outer }
    : { kind: "unknown", reason: "unexpected-outer" }
}
