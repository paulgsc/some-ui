import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { BRAND_VERSIONS, ownDigest } from "@video-motion/brand"
import { COMPOSITIONS } from "@video-motion/render"
import { describe, expect, it } from "vitest"

describe("the brand's open and close, every version kept (HYPER5)", () => {
  it("numbers its versions 1, 2, … each in a folder of its own", () => {
    expect(BRAND_VERSIONS.map((v) => v.version)).toEqual(
      BRAND_VERSIONS.map((_, i) => i + 1)
    )
    expect(BRAND_VERSIONS.map((v) => v.ref)).toEqual(
      BRAND_VERSIONS.map((v) => `brand-v${String(v.version)}`)
    )
  })

  it.each(BRAND_VERSIONS)(
    "keeps version $version's files as they were released",
    async ({ ref, files }) => {
      // A failure here means a released version was edited: make the
      // change a new version instead, so a published video still renders.
      expect(await ownDigest(ref)).toBe(files)
    }
  )

  it.each(BRAND_VERSIONS)(
    "draws version $version from its own mark, at any frame, open or close",
    async ({ ref }) => {
      const html = await readFile(join(COMPOSITIONS, ref, "index.html"), "utf8")
      expect(html).toContain('src="mark.svg"')
      expect(html).not.toContain("brand/mark.svg")
      expect(html).toMatch(/data-composition-id="main"[^>]*data-fit-frame/)
      expect(html).toContain('{"id":"part"')
      await expect(
        readFile(join(COMPOSITIONS, ref, "mark.svg"), "utf8")
      ).resolves.toContain("<svg")
    }
  )
})
