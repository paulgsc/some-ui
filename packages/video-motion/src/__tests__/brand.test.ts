import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { MOCHI_BODY, MOCHI_FACE } from "@some-ui/styles/brand/mark"
import { SESSION_THEME_IDS } from "@some-ui/styles/theme/registry"
import { MOCHI_NIGHT } from "@some-ui/styles/theme/video-palette"
import { BRAND_VERSIONS, ownDigest } from "@video-motion/brand"
import { everyMark, isMarkTheme, themedMark } from "@video-motion/mark"
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
    "draws version $version with the code's mark in any of the app's themes, at any frame, open or close",
    async ({ ref }) => {
      const html = await readFile(join(COMPOSITIONS, ref, "index.html"), "utf8")
      expect(html).toContain('src="mark.svg"')
      expect(html).not.toContain("brand/mark.svg")
      expect(html).toMatch(/data-composition-id="main"[^>]*data-fit-frame/)
      expect(html).toContain('{"id":"part"')
      // The mark is written at render time from the code, never kept here.
      await expect(
        readFile(join(COMPOSITIONS, ref, "mark.svg"), "utf8")
      ).rejects.toThrow()
      const declared = /data-composition-variables='([^']*)'/.exec(html)?.[1]
      const variables: Array<{
        id: string
        options?: Array<{ value: string }>
      }> = JSON.parse(declared ?? "[]")
      const theme = variables.find((v) => v.id === "theme")
      expect(theme?.options?.map((o) => o.value)).toEqual(SESSION_THEME_IDS)
    }
  )
})

describe("the mark a composition draws (HYPER5)", () => {
  it("is the code's mark, in the theme's brand colours, on its ground", () => {
    const night = themedMark("mochi-night")
    expect(night.svg).toContain(MOCHI_BODY)
    expect(night.svg).toContain(MOCHI_FACE)
    expect(night.svg).toContain(`fill:${MOCHI_NIGHT.honey}`)
    expect(night.ground).toBe(MOCHI_NIGHT.background)
    expect(themedMark("rose-night").svg).not.toBe(night.svg)
  })

  it("knows only the app's themes, and pins every one", () => {
    expect(SESSION_THEME_IDS.filter(isMarkTheme)).toEqual(SESSION_THEME_IDS)
    expect(isMarkTheme("sepia")).toBe(false)
    for (const id of SESSION_THEME_IDS)
      expect(everyMark()).toContain(themedMark(id).svg)
  })
})
