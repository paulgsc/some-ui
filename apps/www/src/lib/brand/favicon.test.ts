import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * The brand mark exists twice on disk and cannot not exist twice: a favicon
 * has to sit at the site root for `/favicon.svg` to resolve, and Storybook —
 * a separately-deployed surface — serves its own from a static dir rather than
 * reaching across into another workspace's build output. Two files is the cost
 * of that; two *different* files is the bug it invites, and it would surface
 * as a mismatched icon in a tab strip nobody looks at twice.
 *
 * So: they must be byte-identical, and editing one without the other fails
 * here rather than in production.
 *
 * (The shared copy lives under packages/some-styles/brand rather than any
 * `public/` directory on purpose — .gitignore excludes every `public` folder
 * under packages, so an asset put there is silently never committed.)
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
    // The one geometric decision that is easy to "tidy" back into a bug: at a
    // spacing of 17 the gaps between cells are a third of a pixel once the 64
    // box is drawn at favicon size, and the mark becomes a blob. Anything that
    // narrows this should have to argue with a red test first.
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
