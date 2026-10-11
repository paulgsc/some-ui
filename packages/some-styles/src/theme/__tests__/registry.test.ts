/**
 * @vitest-environment happy-dom
 *
 * Integrity tests for the canonical theme registry.
 *
 * The registry's value is being the *only* list, so both drift directions are
 * checked: metadata for a class that ships no CSS (a switcher entry that does
 * nothing), and CSS for a class no metadata mentions (a theme nothing can
 * enumerate).
 */

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import {
  ACCENT_THEMES,
  ALL_THEME_CLASSES,
  applyTheme,
  BOUNDARY_OVERRIDE_CLASSES,
  FEATURE_APPEARANCES,
  getFeatureAppearance,
  getSessionTheme,
  readStoredPreference,
  resolveTheme,
  RETIRED_THEMES,
  SESSION_THEME_CLASSES,
  SESSION_THEMES,
  THEMES,
} from "../index"

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..")

/** Every class selector actually declared in the shipped CSS. */
function shippedClasses(): Set<string> {
  const files = [
    join(PACKAGE_ROOT, "tokens/base.css"),
    join(PACKAGE_ROOT, "themes.css"),
    ...readdirSync(join(PACKAGE_ROOT, "themes"))
      .filter((f) => f.endsWith(".css"))
      .map((f) => join(PACKAGE_ROOT, "themes", f)),
  ]
  const found = new Set<string>()
  for (const file of files) {
    const css = readFileSync(file, "utf8")
    for (const match of Array.from(css.matchAll(/\.([a-z][a-z0-9-]*)/g))) {
      found.add(match[1]!)
    }
  }
  return found
}

describe("registry integrity", () => {
  it("has unique ids across every scope", () => {
    const ids = THEMES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("only marks session themes selectable", () => {
    for (const theme of THEMES) {
      expect(theme.selectable).toBe(theme.scope === "session")
    }
  })

  it("gives every selectable theme a swatch to render", () => {
    for (const theme of SESSION_THEMES) {
      expect(theme.swatch).toBeDefined()
    }
  })

  it("gives every theme a concrete mode unless it composes", () => {
    // Only themes that layer onto a substrate somebody else already chose may
    // report `inherit`, since they have no `color-scheme` of their own: every
    // accent, a feeling, and a component skin whose tokens derive from that
    // substrate (`.comb`) rather than fixing a ground of their own
    // (`.headline`).
    for (const theme of THEMES) {
      if (theme.mode === "inherit")
        expect(["accent", "component", "feeling"]).toContain(theme.scope)
      else expect(theme.scope).not.toBe("accent")
    }
  })

  it("ships CSS for every registered class", () => {
    const shipped = shippedClasses()
    for (const theme of THEMES) {
      for (const className of theme.boundary.classNames) {
        expect(
          shipped.has(className),
          `theme "${theme.id}" declares .${className}, which no CSS file defines`
        ).toBe(true)
      }
    }
  })

  it("registers metadata for every full-palette class the CSS ships", () => {
    // Guards the other direction: a `themes/*.css` file added without a
    // registry entry is a palette no switcher can offer and no lint rule can
    // recognise. Scoped to the standalone palette files, since themes.css and
    // base.css also carry component-level helper classes.
    const themeFiles = readdirSync(join(PACKAGE_ROOT, "themes")).filter((f) =>
      f.endsWith(".css")
    )
    for (const file of themeFiles) {
      const id = file.replace(/\.css$/, "")
      expect(
        THEMES.some((t) => t.boundary.classNames.includes(id)),
        `themes/${file} ships .${id} but no registry entry declares it`
      ).toBe(true)
    }
  })

  it("derives the session clear-set rather than maintaining it", () => {
    const expected = new Set(
      SESSION_THEMES.flatMap((t) => t.boundary.classNames)
    )
    expect(new Set(SESSION_THEME_CLASSES)).toEqual(expected)
  })

  it("keeps feature and accent classes out of the session clear-set", () => {
    // The controller removes SESSION_THEME_CLASSES from the document root on
    // every apply. If a feature class leaked in here, switching the session
    // theme would silently tear down a host-mounted feature boundary.
    for (const theme of [...FEATURE_APPEARANCES, ...ACCENT_THEMES]) {
      for (const className of theme.boundary.classNames) {
        expect(SESSION_THEME_CLASSES).not.toContain(className)
      }
    }
  })

  it("exposes every class across scopes in ALL_THEME_CLASSES", () => {
    for (const theme of THEMES) {
      for (const className of theme.boundary.classNames) {
        expect(ALL_THEME_CLASSES).toContain(className)
      }
    }
  })

  it("agrees with the lint rule's inlined copy of the override classes", () => {
    // `theme-protocol/no-theme-boundary` cannot import this package (the lint
    // kit builds CJS/ESM under node16 resolution), so its list is a duplicate;
    // this keeps it from rotting, or the rule goes quiet on a new theme.
    const rule = readFileSync(
      join(PACKAGE_ROOT, "../eslint/src/rules/theme-protocol.ts"),
      "utf8"
    )
    const block = rule.match(
      /const BOUNDARY_OVERRIDE_CLASSES = \[([\s\S]*?)\]/
    )?.[1]
    expect(
      block,
      "could not find BOUNDARY_OVERRIDE_CLASSES in the rule — if it was renamed, update this test rather than deleting it"
    ).toBeTruthy()

    const inRule = Array.from(
      (block ?? "").matchAll(/"([^"]+)"/g),
      (m) => m[1]!
    ).sort()
    expect(inRule).toEqual([...BOUNDARY_OVERRIDE_CLASSES].sort())
  })

  it("resolves lookups only within their own scope", () => {
    expect(getSessionTheme("dark")).toBeDefined()
    expect(getSessionTheme("code")).toBeUndefined()
    expect(getFeatureAppearance("code")).toBeDefined()
    expect(getFeatureAppearance("dark")).toBeUndefined()
  })
})

describe("readStoredPreference", () => {
  function stored(value: string): Pick<Storage, "getItem" | "setItem"> & {
    writes: Array<string>
  } {
    const writes: Array<string> = []
    return {
      writes,
      getItem: (): string => value,
      setItem: (_key: string, next: string): void => {
        writes.push(next)
      },
    }
  }

  it.each([
    ["strawberry-moon", "rose-night"],
    ["peachy-blossom", "mochi"],
  ])(
    "opens retired %s as %s and stores the successor",
    (retired, successor) => {
      const storage = stored(retired)
      expect(readStoredPreference(storage)).toBe(successor)
      expect(storage.writes).toEqual([successor])
    }
  )

  it("leaves a live preference alone", () => {
    const storage = stored("harvest-sky")
    expect(readStoredPreference(storage)).toBe("harvest-sky")
    expect(storage.writes).toEqual([])
  })

  it("retires only into themes that still exist", () => {
    for (const successor of Object.values(RETIRED_THEMES)) {
      expect(getSessionTheme(successor)).toBeDefined()
    }
    for (const retired of Object.keys(RETIRED_THEMES)) {
      expect(getSessionTheme(retired)).toBeUndefined()
    }
  })

  it("still drops an id it has never heard of", () => {
    expect(readStoredPreference(stored("no-such-theme"))).toBeNull()
    // An inherited key is not a retired theme.
    expect(readStoredPreference(stored("constructor"))).toBeNull()
  })
})

describe("applyTheme", () => {
  function root(): HTMLElement {
    const element = document.createElement("html")
    document.body.append(element)
    return element
  }

  it("swaps session classes without accumulating them", () => {
    const element = root()
    applyTheme(element, resolveTheme("rose-night"))
    expect(Array.from(element.classList).sort()).toEqual(["dark", "rose-night"])

    applyTheme(element, resolveTheme("harvest-sky"))
    expect(Array.from(element.classList).sort()).toEqual([
      "dark",
      "harvest-sky",
    ])

    applyTheme(element, resolveTheme("mochi"))
    expect(Array.from(element.classList).sort()).toEqual(["mochi"])

    applyTheme(element, resolveTheme("light"))
    expect(Array.from(element.classList)).toEqual([])
  })

  it("mirrors the boundary contract onto the element", () => {
    const element = root()
    applyTheme(element, resolveTheme("mochi"))
    expect(element.dataset.theme).toBe("mochi")
    expect(element.style.colorScheme).toBe("light")
  })

  it("leaves a nested feature boundary alone", () => {
    // Clearing every known theme class would strip `.code` off a host-mounted
    // subtree whenever the user touched the session switcher.

    const element = root()
    element.classList.add("code")
    applyTheme(element, resolveTheme("dark"))
    expect(element.classList.contains("code")).toBe(true)
  })
})
