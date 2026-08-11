/**
 * The CSS half of the contract: what a component is promised will resolve.
 *
 * The registry test proves metadata and CSS agree on which *classes* exist.
 * This one proves the classes carry what components actually consume — the
 * semantic roles, and the feature-namespaced tokens that used to resolve only
 * inside `.cdrama`.
 *
 * That second group is the regression worth pinning. `var(--cdrama-blossom)`
 * outside `.cdrama` resolved to nothing, so five components mounted `.cdrama`
 * on their own root purely to make three variables exist — and mounting a full
 * palette to get three variables is how a feature skin ends up overriding the
 * user's session theme. Defining them ambiently is what made
 * `appearance="inherit"` a viable default; if they ever go back to being
 * `.cdrama`-only, those components render transparent and this fails first.
 */

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { FEATURE_APPEARANCES, SESSION_THEMES } from "./index"

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..")

function read(...parts: Array<string>): string {
  return readFileSync(join(PACKAGE_ROOT, ...parts), "utf8")
}

/** Custom properties declared in the block(s) for `selector` across the file. */
function declaredIn(css: string, selector: string): Set<string> {
  const found = new Set<string>()
  // Matches `.foo {` and compound/descendant forms like `.dark .topik {` or
  // `.cdrama.dark,` — anything whose selector list mentions the class.
  const pattern = new RegExp(
    `(^|[\\s,])[^{}\\n]*\\.${selector.replace(/-/g, "\\-")}\\b[^{}]*\\{([^{}]*)\\}`,
    "gm"
  )
  for (const match of Array.from(css.matchAll(pattern))) {
    for (const decl of Array.from(
      (match[2] ?? "").matchAll(/(--[a-z0-9-]+)\s*:/g)
    )) {
      found.add(decl[1]!)
    }
  }
  return found
}

/** The roles a component may assume exist under any boundary. */
const CORE_ROLES = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--primary",
  "--primary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--border",
  "--destructive",
]

/**
 * Feature-namespaced tokens that in-graph components consume directly. Each
 * must have an ambient default so the component renders without opening a
 * boundary.
 */
const AMBIENT_FEATURE_TOKENS = [
  "--cdrama-blossom",
  "--cdrama-accent",
  "--cdrama-surface",
  "--glow-primary",
  "--glow-accent",
  "--glow-card",
  "--glow-destructive",
]

describe("base tokens", () => {
  const base = read("tokens/base.css")
  const rootBlock = base.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? ""

  it("declares every core semantic role on :root", () => {
    for (const role of CORE_ROLES) {
      expect(rootBlock, `:root is missing ${role}`).toContain(`${role}:`)
    }
  })

  it("gives every feature-namespaced token an ambient default", () => {
    for (const token of AMBIENT_FEATURE_TOKENS) {
      expect(
        rootBlock,
        `${token} has no :root default, so it resolves to nothing outside its feature class — which forces components to mount that class`
      ).toContain(`${token}:`)
    }
  })

  it("derives those defaults from semantic roles rather than literals", () => {
    // The point of the defaults is that they *follow* the active theme. A
    // literal oklch here would resolve, and would still be wrong under every
    // theme but the one it was eyeballed against.
    for (const token of AMBIENT_FEATURE_TOKENS) {
      const value = rootBlock.match(new RegExp(`${token}:\\s*([^;]+);`))?.[1]
      expect(value, `${token} has no value`).toBeTruthy()
      expect(
        value,
        `${token} should be expressed in terms of a semantic role, got: ${value ?? "(nothing)"}`
      ).toMatch(/var\(--/)
    }
  })

  it("redefines the core roles for the dark session theme", () => {
    const darkBlock = base.match(/\n\.dark\s*\{([\s\S]*?)\n\}/)?.[1] ?? ""
    for (const role of CORE_ROLES) {
      expect(darkBlock, `.dark is missing ${role}`).toContain(`${role}:`)
    }
  })
})

describe("session and feature palettes", () => {
  const themeCss = Object.fromEntries(
    readdirSync(join(PACKAGE_ROOT, "themes"))
      .filter((f) => f.endsWith(".css"))
      .map((f) => [f.replace(/\.css$/, ""), read("themes", f)])
  )

  const palettes = [...SESSION_THEMES, ...FEATURE_APPEARANCES].filter(
    // `light` is :root itself and `dark` lives in base.css, both covered above.
    (t) => t.id !== "light" && t.id !== "dark"
  )

  it.each(palettes.map((t) => [t.id] as const))(
    "%s restyles the substrate it claims to own",
    (id) => {
      const css = themeCss[id]
      expect(css, `themes/${id}.css not found`).toBeDefined()
      const declared = declaredIn(css ?? "", id)
      // A full palette must at minimum own the substrate pair — that is what
      // makes it a palette rather than an accent, and what the registry's
      // `session`/`feature` scoping promises callers.
      expect(declared).toContain("--background")
      expect(declared).toContain("--foreground")
    }
  )

  it("keeps cdrama's own overrides for the tokens base.css now defaults", () => {
    // The ambient defaults must not have made the opt-in appearance a no-op:
    // `appearance="cdrama"` should still produce the palette it always did.
    const declared = declaredIn(themeCss.cdrama ?? "", "cdrama")
    for (const token of [
      "--cdrama-blossom",
      "--cdrama-accent",
      "--cdrama-surface",
    ]) {
      expect(declared, `.cdrama no longer overrides ${token}`).toContain(token)
    }
  })
})
