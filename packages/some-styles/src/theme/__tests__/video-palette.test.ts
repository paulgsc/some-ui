/**
 * Mochi Night (SFEED10, #2675): the palette holds the research's rules 1, 2
 * and 4, the rules catch the day palette the research measured failing, and
 * `themes/mochi-night.css` writes each role as its hex.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { parseOklch } from "../session-roles"
import { MOCHI_NIGHT, oklchOf, videoPaletteProblems } from "../video-palette"

describe("Mochi Night", () => {
  it("holds every rule a palette can be measured on", () => {
    expect(videoPaletteProblems(MOCHI_NIGHT)).toEqual([])
  })

  it("catches what the research found in Mochi: honey on cream, and a frame of near white", () => {
    const day = {
      ...MOCHI_NIGHT,
      background: "#fdf3e5",
      surface: "#fdf3e5",
      honey: "#f5a623",
    }
    const problems = videoPaletteProblems(day)
    expect(problems).toContainEqual(
      expect.stringMatching(/^honey on the ground is 1\.\d\d:1 as some see it/)
    )
    expect(problems).toContain("the ground's luma is 0.96, outside 0.06 to 0.2")
  })

  it("is what themes/mochi-night.css writes, role by role", () => {
    const css = readFileSync(
      fileURLToPath(
        new URL("../../../themes/mochi-night.css", import.meta.url)
      ),
      "utf8"
    )
    const token = (name: string): string => {
      const value = new RegExp(`--${name}:\\s*(oklch\\([^)]*\\));`).exec(css)
      if (!value?.[1]) throw new Error(`--${name} is not an oklch() value`)
      return value[1]
    }
    const roles: ReadonlyArray<[string, keyof typeof MOCHI_NIGHT]> = [
      ["background", "background"],
      ["surface", "background"],
      ["card", "surface"],
      ["foreground", "ink"],
      ["muted-foreground", "mutedInk"],
      ["primary", "honey"],
      ["diff-add", "sky"],
      ["destructive", "warning"],
      ["warning", "warning"],
      ["success", "success"],
      ["selection", "highlight"],
    ]
    for (const [name, role] of roles) {
      const [l, c, h] = parseOklch(token(name))
      const [L, C, H] = oklchOf(MOCHI_NIGHT[role])
      expect([name, l], role).toEqual([name, expect.closeTo(L, 4)])
      expect([name, c], role).toEqual([name, expect.closeTo(C, 4)])
      expect([name, h], role).toEqual([name, expect.closeTo(H, 2)])
    }
  })
})
