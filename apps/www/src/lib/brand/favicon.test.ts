import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { MOCHI_BODY, MOCHI_FACE } from "@some-ui/shared"
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

  it.each([
    ...COPIES,
    "apps/mobile/android/app/src/main/res/drawable/ic_launcher_foreground.xml",
    "apps/mobile/android/app/src/main/res/drawable/ic_launcher_monochrome.xml",
  ])("%s draws the shared mark's body and face", (path) => {
    // These files cannot import BrandMark, so they copy its path strings;
    // a retouched mark that misses one shows up here, not on a phone.
    const contents = readFileSync(resolve(REPO_ROOT, path), "utf8")
    expect(contents).toContain(MOCHI_BODY)
    expect(contents).toContain(MOCHI_FACE)
  })
})
