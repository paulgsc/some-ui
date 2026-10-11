/**
 * The host adapter's half of the theme protocol, checked against the canonical
 * registry. Two hand-maintained duplicates of `@some-ui/styles/theme` in each
 * HTML entry (`index.html` and `resume/index.html`): the pre-paint no-flash
 * script (it runs before any module loads, so cannot import the controller)
 * and the fallback `<style>` above it. Drift is invisible in dev and shows in production as a flash of the
 * wrong theme, or a silent fallback to light on reload.
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  DEFAULT_PREFERENCE,
  resolveTheme,
  RETIRED_THEMES,
  SESSION_THEMES,
  THEME_STORAGE_KEY,
} from "@some-ui/styles/theme"
import { describe, expect, it } from "vitest"
import { z } from "zod"

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..")
/** Every HTML entry that carries its own copy of the pre-paint script. */
const ENTRIES = ["index.html", "resume/index.html"]

const prePaintEntrySchema = z.object({
  classes: z.array(z.string()),
  mode: z.string(),
})
type PrePaintEntry = z.infer<typeof prePaintEntrySchema>

/**
 * The `map` object literal out of the pre-paint script, as a Map so a
 * missing theme reads as `undefined`.
 */
function prePaintMap(indexHtml: string): Map<string, PrePaintEntry> {
  const match = indexHtml.match(/var map = (\{[\s\S]*?\n {10}\})/)
  if (!match?.[1]) throw new Error("pre-paint theme map not found")

  // JSON-shaped JS (bare keys, maybe trailing commas): parsed, never
  // evaluated.
  const json = match[1]
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/,(\s*[}\]])/g, "$1")

  const parsed = z
    .record(z.string(), prePaintEntrySchema)
    .parse(JSON.parse(json))
  return new Map(Object.entries(parsed))
}

describe.each(ENTRIES)("%s pre-paint script ↔ registry", (file) => {
  const indexHtml = readFileSync(join(APP_ROOT, file), "utf8")

  it("uses the controller's storage key", () => {
    expect(indexHtml).toContain(`var key = "${THEME_STORAGE_KEY}"`)
  })

  it("maps exactly the selectable session themes", () => {
    expect([...prePaintMap(indexHtml).keys()].sort()).toEqual(
      SESSION_THEMES.map((t) => t.id).sort()
    )
  })

  it("applies the same classes and color-scheme the controller would", () => {
    const map = prePaintMap(indexHtml)
    for (const theme of SESSION_THEMES) {
      const entry = map.get(theme.id)
      expect(entry, `no pre-paint entry for "${theme.id}"`).toBeDefined()
      expect([...(entry?.classes ?? [])].sort()).toEqual(
        [...theme.boundary.classNames].sort()
      )
      expect(entry?.mode).toBe(theme.mode)
    }
  })

  it("opens a retired theme as the controller does", () => {
    // Prettier wraps the literal once it outgrows a line, trailing comma
    // and all; JSON.parse takes it once that comma goes.
    const match = indexHtml.match(/var retired = (\{[\s\S]*?\})/)
    if (!match?.[1])
      throw new Error("retired-theme map not found in index.html")
    expect(JSON.parse(match[1].replace(/,(\s*\})/, "$1"))).toEqual(
      RETIRED_THEMES
    )
  })

  it("paints the default preference's background in the no-JS fallback", () => {
    // `html:not([data-theme])` must match DEFAULT_PREFERENCE, or the first
    // paint is the flash the script exists to prevent.
    const fallback = resolveTheme(DEFAULT_PREFERENCE, true)
    expect(indexHtml).toMatch(
      new RegExp(
        `html:not\\(\\[data-theme\\]\\) \\{\\s*color-scheme: ${fallback.mode};`
      )
    )
  })
})
