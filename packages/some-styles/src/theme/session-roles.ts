/**
 * The session themes' roles as the browser resolves them, read from this
 * package's own CSS rather than copied: `SESSION_THEMES` swatches carry only
 * a background, a foreground and an accent, and a hand copy of the rest goes
 * stale the day a theme is retuned.
 *
 * Small on purpose: it understands what the session themes write today (a
 * plain `selector { --x: value; }` block, `oklch()`, `var()` with or without
 * a fallback, and `color-mix(in oklab, …)`), and throws on anything else, so
 * a theme written another way fails the feeling tests loudly instead of
 * resolving to a guess.
 */

import type { Oklch, SessionRoles } from "./feeling"
import { mixOklab } from "./feeling"
import type { SessionTheme } from "./registry"

/** CSS source text, by file: `tokens/base.css` and each `themes/<id>.css`. */
export type ThemeSources = {
  base: string
  themes: Readonly<Record<string, string>>
}

/** The declarations of every block whose whole selector is `selector`. */
function declarations(css: string, selector: string): Map<string, string> {
  const found = new Map<string, string>()
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "")
  for (const match of Array.from(
    withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)
  )) {
    const [, selectors = "", body = ""] = match
    if (selectors.trim() !== selector) continue
    for (const declaration of body.split(";")) {
      const colon = declaration.indexOf(":")
      const name = declaration.slice(0, colon).trim()
      if (colon === -1 || !name.startsWith("--")) continue
      found.set(name, declaration.slice(colon + 1).trim())
    }
  }
  return found
}

/** The custom properties in force on a session theme's root, unresolved. */
function cascade(
  theme: SessionTheme,
  sources: ThemeSources
): Map<string, string> {
  const merged = new Map(declarations(sources.base, ":root"))
  const layer = (from: Map<string, string>): void => {
    from.forEach((value, name) => merged.set(name, value))
  }
  for (const name of theme.boundary.classNames) {
    if (name === "dark") layer(declarations(sources.base, ".dark"))
    else {
      const css = sources.themes[name]
      if (css === undefined) throw new Error(`themes/${name}.css not given`)
      layer(declarations(css, `.${name}`))
    }
  }
  return merged
}

/** Splits `a, b, c` at top-level commas. */
function args(text: string): Array<string> {
  const parts: Array<string> = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++
    else if (text[i] === ")") depth--
    else if (text[i] === "," && depth === 0) {
      parts.push(text.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(text.slice(start).trim())
  return parts
}

const call = (value: string, name: string): string | undefined => {
  const prefix = `${name}(`
  return value.startsWith(prefix) && value.endsWith(")")
    ? value.slice(prefix.length, -1)
    : undefined
}

function number(text: string, scale: number): number {
  const percent = text.endsWith("%")
  const parsed = Number.parseFloat(text.replace(/(%|deg)$/, ""))
  if (Number.isNaN(parsed)) throw new Error(`not a number: ${text}`)
  return percent ? (parsed / 100) * scale : parsed
}

function resolve(
  value: string,
  properties: Map<string, string>,
  seen: ReadonlySet<string> = new Set()
): Oklch {
  const v = value.trim()
  const reference = call(v, "var")
  if (reference !== undefined) {
    const [name = "", fallback] = args(reference)
    if (seen.has(name)) throw new Error(`var() cycle through ${name}`)
    const target = properties.get(name) ?? fallback
    if (target === undefined) throw new Error(`${name} is not declared`)
    return resolve(target, properties, new Set(Array.from(seen).concat(name)))
  }
  const lch = call(v, "oklch")
  if (lch !== undefined) {
    const [l = "", c = "", h = ""] = lch.split("/")[0]!.trim().split(/\s+/)
    return [number(l, 1), number(c, 0.4), number(h, 1)]
  }
  const mix = call(v, "color-mix")
  if (mix !== undefined) {
    const [space, first = "", second = ""] = args(mix)
    if (space !== "in oklab") {
      throw new Error(`unsupported mix: ${space ?? ""}`)
    }
    const weighted = (part: string): { color: string; weight?: number } => {
      const at = part.match(/^(.*?)\s+(-?[\d.]+)%$/)
      return at
        ? { color: at[1]!, weight: Number(at[2]) / 100 }
        : { color: part }
    }
    const a = weighted(first)
    const b = weighted(second)
    const weightOfB = b.weight ?? (a.weight === undefined ? 0.5 : 1 - a.weight)
    return mixOklab(
      resolve(a.color, properties, seen),
      resolve(b.color, properties, seen),
      weightOfB
    )
  }
  throw new Error(`unsupported colour value: ${v}`)
}

/** The roles a feeling theme is derived from, as `theme` resolves them. */
export function sessionRoles(
  theme: SessionTheme,
  sources: ThemeSources
): SessionRoles {
  const properties = cascade(theme, sources)
  const role = (name: string): Oklch => resolve(`var(${name})`, properties)
  return {
    mode: theme.mode,
    background: role("--background"),
    foreground: role("--foreground"),
    mutedForeground: role("--muted-foreground"),
  }
}
