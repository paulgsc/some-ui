import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * The brand mark exists twice on disk (the site root's `/favicon.svg`, and
 * the shared copy the extensions' icons are rasterized from) and the copies
 * must be byte-identical. The shared copy lives under
 * packages/some-styles/brand because .gitignore excludes every `public`
 * folder under packages.
 */

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../.."
)

const COPIES = [
  "apps/www/public/favicon.svg",
  "packages/some-styles/brand/favicon.svg",
] as const

describe("brand favicon", () => {
  it("is identical everywhere it is copied", () => {
    const [first, ...rest] = COPIES.map((path) => ({
      path,
      contents: readFileSync(resolve(REPO_ROOT, path), "utf8"),
    }))

    for (const copy of rest) {
      expect(copy.contents, `${copy.path} has drifted from ${first.path}`).toBe(
        first.contents
      )
    }
  })

  it("keeps the cell spacing that makes it legible at 16px", () => {
    // At a spacing of 17 the gaps are a third of a pixel at favicon size and
    // the mark becomes a blob.
    const svg = readFileSync(resolve(REPO_ROOT, COPIES[0]), "utf8")
    const offsets = [...svg.matchAll(/translate\((-?[\d.]+) (-?[\d.]+)\)/g)]
      .map(([, x, y]) => [Number(x), Number(y)] as const)
      // The outer <g> centres the mark at (32 32); the cells are the rest.
      .filter(([x, y]) => !(x === 32 && y === 32))

    expect(offsets).toHaveLength(6)
    for (const [x, y] of offsets) {
      expect(Math.hypot(x, y)).toBeCloseTo(20, 2)
    }
  })
})
