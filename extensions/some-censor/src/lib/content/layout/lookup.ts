/**
 * Reading the layout table (BC1, #1434): the questions a Sensor asks of it,
 * answered from data alone.
 *
 * Pure. Nothing here touches a node; the Sensor (BC2) supplies the tag it
 * observed and the enclosing catalogue tag it *confirmed* (one table-directed
 * `closest()`, never an open-ended walk), and gets back a classification —
 * including the explicit "I do not know" the Boundary Contract's B4 requires
 * be a state rather than an exception.
 */

import { LAYOUT_SCHEMA_VERSION } from "./schema"
import type { LayoutTable, SurfaceLayout, TagShape } from "./schema"
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
 * Classify `(surface, tag, outer)`.
 *
 * `outer` is the nearest enclosing catalogue tag the Sensor confirmed, or
 * `null` when it confirmed there is none. `catalogue` is the set of tags the
 * extension tracks at all (`VIDEO_SELECTORS`), passed in so this module
 * stays a function of its arguments.
 */
export function classifyShape(
  table: LayoutTable,
  catalogue: ReadonlyArray<string>,
  surface: BoyoSurface,
  tag: string,
  outer: string | null
): ShapeClassification {
  if (!catalogue.includes(tag)) return { kind: "not-card" }

  const resolved = resolveSurface(table, surface)
  if (resolved.kind === "none") {
    return { kind: "unknown", reason: "surface-uncrawled" }
  }

  const seen = resolved.layout.shapes.filter((s) => s.tag === tag)
  if (seen.length === 0) return { kind: "unknown", reason: "tag-unseen" }

  if (outer === null) {
    return seen.some((s) => s.role === "anchor")
      ? { kind: "anchor" }
      : { kind: "unknown", reason: "nested-without-outer" }
  }

  return seen.some((s) => s.role === "nested" && s.outer === outer)
    ? { kind: "nested", outer }
    : { kind: "unknown", reason: "unexpected-outer" }
}

/**
 * The outer tags a given tag has ever been seen nested inside, on a surface.
 * What the Sensor hands to `closest()` — so the walk is directed at the
 * table's declared parents and nothing else.
 */
export function declaredOuters(
  table: LayoutTable,
  surface: BoyoSurface,
  tag: string
): ReadonlyArray<string> {
  const resolved = resolveSurface(table, surface)
  if (resolved.kind === "none") return []
  const outers = resolved.layout.shapes
    .filter((s: TagShape) => s.tag === tag && s.role === "nested")
    .map((s) => s.outer)
    .filter((o): o is string => o !== null)
  return [...new Set(outers)].sort()
}
