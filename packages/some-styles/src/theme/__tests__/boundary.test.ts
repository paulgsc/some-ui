/**
 * @vitest-environment happy-dom
 */
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import {
  appearanceClassName,
  appearanceProps,
  applyAppearance,
  SESSION_THEMES,
  sessionThemeProps,
} from "../index"

describe("appearanceProps", () => {
  it("emits nothing for the inherit default", () => {
    expect(appearanceProps("inherit")).toEqual({})
    expect(appearanceClassName("inherit")).toBe("")
  })

  it("emits the boundary contract for a feature appearance", () => {
    expect(appearanceProps("code")).toEqual({
      className: "code",
      "data-appearance": "code",
    })
  })

  it("never emits a session theme class", () => {
    // The type already forbids it; this pins the runtime behaviour so a cast
    // or a JS caller cannot use this helper to force the user's theme.
    for (const id of SESSION_THEMES.map((theme) => theme.id)) {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- deliberately handing the helper a value its type forbids, which is the whole point: the guard has to hold for a JS caller or a cast too.
      expect(appearanceProps(id as "code")).toEqual({})
    }
  })
})

describe("applyAppearance", () => {
  it("replaces a previously applied feature boundary", () => {
    const element = document.createElement("div")
    applyAppearance(element, "code")
    expect(element.classList.contains("code")).toBe(true)
    expect(element.dataset.appearance).toBe("code")

    applyAppearance(element, "cdrama")
    expect(element.classList.contains("code")).toBe(false)
    expect(element.classList.contains("cdrama")).toBe(true)
  })

  it("clears back to inherit and leaves unrelated classes intact", () => {
    const element = document.createElement("div")
    element.classList.add("flex", "dark")
    applyAppearance(element, "topik")
    applyAppearance(element, "inherit")

    expect(element.dataset.appearance).toBeUndefined()
    expect(Array.from(element.classList).sort()).toEqual(["dark", "flex"])
  })
})

describe("sessionThemeProps", () => {
  it("leaves the ground to what is around it, for a mark in another theme", () => {
    expect(sessionThemeProps("mochi", { ground: false }).style).toEqual({
      colorScheme: "light",
      backgroundColor: "transparent",
    })
  })

  it("keeps the caller's class, and with no theme gives only that", () => {
    expect(
      sessionThemeProps("mochi-night", { className: "pd-frame" })
    ).toMatchObject({
      className: "session-theme dark mochi-night pd-frame",
    })
    expect(sessionThemeProps(undefined, { className: "pd-frame" })).toEqual({
      className: "pd-frame",
    })
  })

  it("starts a nested theme from the base palette, then its own", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../..")
    const base = readFileSync(join(root, "tokens/base.css"), "utf8")
    // The palette is declared on the boundary as well as the page's root.
    const palette = /:root,\s*\.session-theme\s*\{([^}]*)\}/.exec(base)
    expect(palette?.[1]).toContain("--brand:")
    expect(palette?.[1]).toContain("--background:")
    // `.dark`, the same specificity, comes after, so it overrides it.
    expect(base.indexOf(".dark {")).toBeGreaterThan(palette?.index ?? -1)
    // Every session theme's own file comes after the palette, so it does too.
    const tailwind = readFileSync(join(root, "tailwind.css"), "utf8")
    const at = (file: string): number => tailwind.indexOf(`@import "${file}"`)
    for (const theme of SESSION_THEMES.flatMap((t) => t.boundary.classNames))
      if (theme !== "dark")
        expect(at(`./themes/${theme}.css`)).toBeGreaterThan(
          at("./tokens/base.css")
        )
  })
})
