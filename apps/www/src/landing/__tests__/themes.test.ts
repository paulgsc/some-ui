/**
 * The landing in the repo's own themes (C1184): every session theme, resolved
 * from @some-ui/styles' CSS, the device's by default, any other by a picker
 * with no script, and a template that names no colour of its own.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { landingMochi } from "@/landing/mochi"
import { renderLanding, renderLandingHead } from "@/landing/render"
import { THEME_ICONS } from "@/landing/theme-icons"
import {
  DEVICE_THEMES,
  landingThemes,
  THEME_ROLES,
  themeCss,
} from "@/landing/themes"
import { LANDING_WORDS } from "@/landing/words"
import { resumeData } from "@some-ui/resume"
import { SESSION_THEMES } from "@some-ui/styles/theme/registry"
import { sessionColours } from "@some-ui/styles/theme/sources"
import { contrast } from "@some-ui/styles/theme/video-palette"
import { describe, expect, it } from "vitest"

const THEMES = landingThemes(SESSION_THEMES, sessionColours)

/** Every name the landing's CSS reads a theme by. */
const LANDING_ROLES = [
  "--bg",
  "--fg",
  "--card",
  "--stage",
  "--muted",
  "--accent",
  "--accent-fg",
  "--chart-a",
  "--chart-b",
  "--heart",
  "--screen",
  "--screen-fg",
]

describe("landingThemes", () => {
  it("wears every session theme the repo offers, each role resolved", () => {
    expect(THEMES.map((t) => t.id)).toEqual(SESSION_THEMES.map((t) => t.id))
    for (const theme of THEMES)
      for (const role of THEME_ROLES)
        expect(theme.colours[role], `${theme.id} ${role}`).toMatch(
          /^#[0-9a-f]{6}$/
        )
  })

  it("refuses a theme whose resolver left a role out", () => {
    expect(() => landingThemes(SESSION_THEMES.slice(0, 1), () => ({}))).toThrow(
      "no --background resolved"
    )
  })
})

describe("the landing's text in every theme", () => {
  it("reads at 4.5:1 or more in every pairing of roles the page sets words in", () => {
    for (const t of THEMES) {
      const c = t.colours
      const light = t.mode === "light"
      const screen = light ? c["--foreground"] : c["--background"]
      const screenInk = light ? c["--background"] : c["--foreground"]
      const pairs: ReadonlyArray<readonly [string, string, string]> = [
        ["ink on the page", c["--foreground"], c["--background"]],
        ["ink on a card", c["--foreground"], c["--card"]],
        ["muted on the page", c["--muted-foreground"], c["--background"]],
        ["muted on a card", c["--muted-foreground"], c["--card"]],
        ["a link on the page", c["--primary"], c["--background"]],
        ["a link on a card", c["--primary"], c["--card"]],
        ["the résumé button", c["--primary-foreground"], c["--primary"]],
        // A screen's title card: the theme's ground on its ink, or the reverse.
        ["a title card", screenInk, screen],
      ]
      for (const [what, ink, ground] of pairs)
        expect(
          contrast(ink, ground),
          `${t.id}: ${what}`
        ).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe("themeCss", () => {
  const css = themeCss(THEMES)

  it("follows the device with the brand's light and dark themes", () => {
    const light = THEMES.find((t) => t.id === DEVICE_THEMES.light)
    const dark = THEMES.find((t) => t.id === DEVICE_THEMES.dark)
    expect(light?.mode).toBe("light")
    expect(dark?.mode).toBe("dark")
    expect(css).toContain(
      `:root { color-scheme: light; --bg: ${light?.colours["--background"] ?? ""};`
    )
    expect(css).toContain(
      `@media (prefers-color-scheme: dark) { :root { color-scheme: dark; --bg: ${dark?.colours["--background"] ?? ""};`
    )
  })

  it("gives every theme a rule its radio applies, declaring every role the page reads", () => {
    for (const theme of THEMES) {
      const rule = css
        .split("\n")
        .find((line) => line.includes(`:root:has(#theme-${theme.id}:checked)`))
      expect(rule, theme.id).toBeDefined()
      for (const role of LANDING_ROLES)
        expect(rule, `${theme.id} ${role}`).toContain(` ${role}: #`)
    }
  })

  it("refuses a set without the device's two themes", () => {
    expect(() =>
      themeCss(THEMES.filter((t) => t.id !== DEVICE_THEMES.dark))
    ).toThrow(`the landing needs theme ${DEVICE_THEMES.dark}`)
  })
})

describe("the landing's colours", () => {
  const template = readFileSync(
    join(import.meta.dirname, "../../../landing/index.html"),
    "utf8"
  )
  const style = template.slice(
    template.indexOf("<style>"),
    template.indexOf("</style>")
  )

  it("names no colour of its own outside the drawing of a web page", () => {
    // Page Filter's drawing depicts a page, white and dark: its subject's
    // colours, declared once on its block.
    const own = style
      .split("\n")
      .filter((line) => !/^\s*--page-[a-z]+: oklch\(/.test(line))
      .join("\n")
    expect(own).not.toMatch(/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|lab|lch)\(/i)
    expect(own).not.toMatch(/:\s*(white|black)\b/i)
    for (const role of LANDING_ROLES.filter(
      (r) => r !== "--chart-a" && r !== "--chart-b"
    ))
      expect(style, role).toContain(`var(${role})`)
  })

  it("puts the themes in the head and the picker in the header, with no script", () => {
    const head = renderLandingHead(LANDING_WORDS, [], THEMES)
    expect(head).toContain(themeCss(THEMES))
    const page = renderLanding(
      resumeData.fullstack,
      landingMochi(),
      LANDING_WORDS,
      new Map(),
      [],
      { themes: THEMES, icons: THEME_ICONS }
    )
    const header = page.slice(0, page.indexOf("</header>"))
    const radios = [
      ...header.matchAll(
        /<input type="radio" name="theme" id="theme-([a-z-]+)" autocomplete="off"( checked)?/g
      ),
    ]
    expect(radios.map((r) => r[1])).toEqual([
      "device",
      ...THEMES.map((t) => t.id),
    ])
    // The device's own is chosen until the reader picks another.
    expect(radios.filter((r) => r[2] === " checked").map((r) => r[1])).toEqual([
      "device",
    ])
    // The app's switcher's own marks (lucide's Palette and Monitor), as the
    // build draws them: the palette opens the picker, and the monitor marks
    // the device's choice.
    const summary = header.slice(
      header.indexOf("<summary"),
      header.indexOf("</summary>")
    )
    expect(summary).toContain(THEME_ICONS.palette)
    expect(summary).toContain(LANDING_WORDS.theme)
    expect(header).toMatch(
      /id="theme-device"[^>]*\/><span class="swatch swatch--icon"/
    )
    expect(header).toContain(THEME_ICONS.device)
    expect(page + head).not.toMatch(/<script|onchange|onclick/i)
  })
})
