/**
 * Assembling a layout table from per-page measurements (BC1, #1434) — the
 * step between `fingerprintSurface()` (one page) and the checked-in artifact
 * (every surface, plus the `"*"` union).
 *
 * Pure. Shared by `scripts/crawl-layout.ts` and `layout.test.ts` so the test
 * asserts against exactly what the crawler would write, not a re-derivation.
 */

import { mergeLayouts } from "./fingerprint"
import { LAYOUT_SCHEMA_VERSION } from "./schema"
import type { LayoutSource, LayoutTable, SurfaceLayout } from "./schema"
import type { BoyoSurface } from "./surface"

export type AssembleInput = {
  readonly source: LayoutSource
  readonly generator: string
  readonly generatedAt: string
  /** One layout per page crawled; several pages may share a surface. */
  readonly layouts: ReadonlyArray<SurfaceLayout>
}

export type Assembled = {
  readonly table: LayoutTable
  /**
   * Surfaces whose crawl observed no catalogue tag at all, and which were
   * therefore left out of the table so that `resolveSurface()` serves them
   * from the `"*"` union instead. A page that rendered no cards — a consent
   * wall, a signed-out `/feed/subscriptions` prompt, a skeleton the crawl
   * did not wait out — is not evidence that the surface has no cards, and
   * recording it as such would classify every real card there as
   * `tag-unseen`.
   */
  readonly skipped: ReadonlyArray<BoyoSurface>
}

export function assembleTable(input: AssembleInput): Assembled {
  const bySurface = new Map<BoyoSurface, Array<SurfaceLayout>>()
  for (const layout of input.layouts) {
    if (layout.surface === "*") continue
    const list = bySurface.get(layout.surface) ?? []
    list.push(layout)
    bySurface.set(layout.surface, list)
  }

  const surfaces: Partial<Record<BoyoSurface | "*", SurfaceLayout>> = {}
  const kept: Array<SurfaceLayout> = []
  const skipped: Array<BoyoSurface> = []
  for (const [surface, list] of [...bySurface].sort(([a], [b]) =>
    a < b ? -1 : 1
  )) {
    const merged = mergeLayouts(surface, list)
    if (merged.shapes.length === 0) {
      skipped.push(surface)
      continue
    }
    surfaces[surface] = merged
    kept.push(merged)
  }
  surfaces["*"] = mergeLayouts("*", kept)

  return {
    table: {
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      source: input.source,
      generatedAt: input.generatedAt,
      generator: input.generator,
      surfaces,
    },
    skipped,
  }
}
