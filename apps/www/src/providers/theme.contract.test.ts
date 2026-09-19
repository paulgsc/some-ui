/**
 * The host adapter's half of the theme protocol, checked against the canonical
 * registry.
 *
 * Two things here are hand-maintained duplicates of `@some-ui/styles/theme`,
 * and both were carrying a "keep in sync" comment and nothing else:
 *
 *   - the pre-paint no-flash script in `index.html`, which has to run before
 *     any module loads and therefore cannot import the controller; and
 *   - the fallback `<style>` block above it, which paints the default theme's
 *     background for the frame before that script runs.
 *
 * Drift in the first is invisible in dev (the provider corrects it on mount)
 * and shows up in production as a flash of the wrong theme, or — for a theme
 * added to the registry but not to the map — as the app silently falling back
 * to light on reload while the switcher still says otherwise. That is a bug
 * report nobody traces to an HTML comment, so it is asserted instead.
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  DEFAULT_PREFERENCE,
  resolveTheme,
  SESSION_THEMES,
  THEME_STORAGE_KEY,
} from "@some-ui/styles/theme"
import { describe, expect, it } from "vitest"
import { z } from "zod"

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..")
const indexHtml = readFileSync(join(APP_ROOT, "index.html"), "utf8")

const prePaintEntrySchema = z.object({
  classes: z.array(z.string()),
  mode: z.string(),
})
type PrePaintEntry = z.infer<typeof prePaintEntrySchema>

/**
 * The `map` object literal out of the pre-paint script.
 *
 * Returned as a Map so a missing theme reads as `undefined` at the call site
 * rather than as a lie from the index signature — a theme absent from the map
 * is precisely the drift being tested for.
 */
function prePaintMap(): Map<string, PrePaintEntry> {
  const match = indexHtml.match(/var map = (\{[\s\S]*?\n {10}\})/)
  if (!match?.[1])
    throw new Error("pre-paint theme map not found in index.html")

  // The literal is JSON-shaped JS: bare identifier keys and possible trailing
  // commas are the only two things standing between it and JSON.parse. Parsing
  // beats evaluating — this file ships to browsers, and a test that runs it
  // would happily run whatever else landed inside those braces.
  const json = match[1]
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/,(\s*[}\]])/g, "$1")

  const parsed = z
    .record(z.string(), prePaintEntrySchema)
    .parse(JSON.parse(json))
  return new Map(Object.entries(parsed))
}

describe("pre-paint script ↔ registry", () => {
  it("uses the controller's storage key", () => {
    expect(indexHtml).toContain(`var key = "${THEME_STORAGE_KEY}"`)
  })

  it("maps exactly the selectable session themes", () => {
    expect([...prePaintMap().keys()].sort()).toEqual(
      SESSION_THEMES.map((t) => t.id).sort()
    )
  })

  it("applies the same classes and color-scheme the controller would", () => {
    const map = prePaintMap()
    for (const theme of SESSION_THEMES) {
      const entry = map.get(theme.id)
      expect(entry, `no pre-paint entry for "${theme.id}"`).toBeDefined()
      expect([...(entry?.classes ?? [])].sort()).toEqual(
        [...theme.boundary.classNames].sort()
      )
      expect(entry?.mode).toBe(theme.mode)
    }
  })

  it("paints the default preference's background in the no-JS fallback", () => {
    // `html:not([data-theme])` covers the frame before the script runs. It has
    // to match whatever DEFAULT_PREFERENCE resolves to, or the very first paint
    // is the wrong color — the exact flash the script exists to prevent.
    const fallback = resolveTheme(DEFAULT_PREFERENCE, true)
    expect(indexHtml).toMatch(
      new RegExp(
        `html:not\\(\\[data-theme\\]\\) \\{\\s*color-scheme: ${fallback.mode};`
      )
    )
  })
})
