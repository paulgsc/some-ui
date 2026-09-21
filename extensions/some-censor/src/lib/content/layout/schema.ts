/**
 * The layout table's schema (BC1, #1434) — what the crawler writes and what
 * the Sensor (BC2, #1435) reads.
 *
 * The table is a checked-in, generated artifact describing YouTube's card
 * DOM shape per surface: which catalogue tags appear, how they nest, and
 * which of the extension's own extraction selectors they satisfy. It is
 * *observed*, not derived — a heuristic with a shelf life (#1433), which is
 * why it carries a schema version, a source, and a generation timestamp, and
 * why nothing here is allowed to be hand-edited.
 *
 * Pure: types and a validator over plain data. No DOM, no browser globals.
 */

import type { BoyoSurface } from "./surface"

/**
 * Bumped whenever the *shape* of this file changes in a way an older Sensor
 * could not read. A Sensor compares it against the version it was built for
 * (`tableStatus()` in lookup.ts) so "this table's schema is one I do not
 * understand" is a distinct answer from "this table is merely stale".
 */
export const LAYOUT_SCHEMA_VERSION = 1

/** Where the crawl's pages came from. */
export type LayoutSource = "fixtures" | "live"

/**
 * How a catalogue tag was seen to sit on a surface.
 *
 * `anchor` — a top-level card: no other catalogue tag encloses it.
 * `nested` — inside another catalogue tag (`outer`), which is the anchor. The
 *            #1426 case: `ytd-rich-item-renderer > yt-lockup-view-model`.
 */
export type ShapeRole = "anchor" | "nested"

export type CardField = "title" | "channelName" | "duration" | "uploadDate"

/** One (tag, role, outer) combination as observed on one surface. */
export type TagShape = {
  readonly tag: string
  readonly role: ShapeRole
  /** The enclosing catalogue tag for a nested shape; `null` for an anchor. */
  readonly outer: string | null
  /** Occurrences observed on the crawled page(s). */
  readonly count: number
  /** How many of `count` contained a watch or shorts href anywhere. */
  readonly withVideoLink: number
  /** How many of `count` carried an authoritative `data-video-id`. */
  readonly withDataVideoId: number
  /**
   * For each field, the extraction selectors (from `fields.ts`, by index)
   * that matched at least once. What a Sensor needs to know whether a field
   * is expected to be extractable on this surface at all.
   */
  readonly fields: Readonly<Record<CardField, ReadonlyArray<number>>>
}

export type SurfaceLayout = {
  readonly surface: BoyoSurface | "*"
  /** The path(s) crawled — never a query string (#1382). */
  readonly paths: ReadonlyArray<string>
  /** Sorted by (tag, role, outer) so regeneration is diff-stable. */
  readonly shapes: ReadonlyArray<TagShape>
}

export type LayoutTable = {
  readonly schemaVersion: number
  readonly source: LayoutSource
  /** The one field that legitimately differs between two identical crawls. */
  readonly generatedAt: string
  /** Free text: the crawler invocation, so a diff says how to reproduce it. */
  readonly generator: string
  /**
   * Keyed by surface. `"*"` is the union of every crawled surface, and is
   * what the Sensor falls back to on a surface the crawl never visited.
   */
  readonly surfaces: Readonly<Partial<Record<BoyoSurface | "*", SurfaceLayout>>>
}

const ROLES: ReadonlyArray<string> = ["anchor", "nested"]
const FIELDS: ReadonlyArray<string> = [
  "title",
  "channelName",
  "duration",
  "uploadDate",
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isNumberArray(value: unknown): value is ReadonlyArray<number> {
  return Array.isArray(value) && value.every((n) => typeof n === "number")
}

function isTagShape(value: unknown): value is TagShape {
  if (!isRecord(value)) return false
  if (typeof value["tag"] !== "string") return false
  if (typeof value["role"] !== "string" || !ROLES.includes(value["role"])) {
    return false
  }
  if (value["outer"] !== null && typeof value["outer"] !== "string")
    return false
  if (typeof value["count"] !== "number") return false
  if (typeof value["withVideoLink"] !== "number") return false
  if (typeof value["withDataVideoId"] !== "number") return false
  const fields = value["fields"]
  if (!isRecord(fields)) return false
  return FIELDS.every((f) => isNumberArray(fields[f]))
}

export function isSurfaceLayout(value: unknown): value is SurfaceLayout {
  if (!isRecord(value)) return false
  if (typeof value["surface"] !== "string") return false
  const paths = value["paths"]
  if (!Array.isArray(paths) || !paths.every((p) => typeof p === "string")) {
    return false
  }
  const shapes = value["shapes"]
  return Array.isArray(shapes) && shapes.every(isTagShape)
}

/**
 * Structural validation of a table's *content*, independent of its version.
 * A table that fails this is corrupt; a table that passes it but carries a
 * different `schemaVersion` is the "unknown schema" case `tableStatus()`
 * distinguishes.
 */
export function isLayoutTable(value: unknown): value is LayoutTable {
  if (!isRecord(value)) return false
  if (typeof value["schemaVersion"] !== "number") return false
  if (value["source"] !== "fixtures" && value["source"] !== "live") return false
  if (typeof value["generatedAt"] !== "string") return false
  if (typeof value["generator"] !== "string") return false
  const surfaces = value["surfaces"]
  if (!isRecord(surfaces)) return false
  return Object.entries(surfaces).every(
    ([key, layout]) => isSurfaceLayout(layout) && layout.surface === key
  )
}
