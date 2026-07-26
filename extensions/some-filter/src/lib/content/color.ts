/**
 * Color primitives shared by the theme detector (read-only sampling) and the
 * theme applier (luminance bucketing of patched elements).
 *
 * Pure functions only — no DOM mutation. `effectiveBgLuminance` reads computed
 * style but never writes. Kept as a leaf module so neither theme-detector nor
 * theme-apply has to depend on the other for color math.
 */

export type RGBA = [number, number, number, number]

/**
 * Parses #rgb/#rgba/#rrggbb/#rrggbbaa. getComputedStyle never returns this
 * format (browsers always normalize to rgb()/rgba()), but the swatch
 * registry (swatches.ts) stores its canonical colors as hex literals, and
 * anything comparing a computed style against a swatch color needs both
 * forms to parse to the same representation.
 */
function parseHexColor(css: string): RGBA | null {
  const match = css.match(
    /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
  )
  if (match === null) {
    return null
  }

  const hex = match[1]
  if (hex === undefined) {
    return null
  }

  // charAt() always returns `string` (empty string past the end), unlike
  // indexed access, which is `string | undefined` under
  // noUncheckedIndexedAccess — avoids a run of non-null assertions here.
  const expand = (short: string): string => short + short
  const isShort = hex.length === 3 || hex.length === 4
  const rHex = isShort ? expand(hex.charAt(0)) : hex.slice(0, 2)
  const gHex = isShort ? expand(hex.charAt(1)) : hex.slice(2, 4)
  const bHex = isShort ? expand(hex.charAt(2)) : hex.slice(4, 6)
  const aHex =
    hex.length === 4
      ? expand(hex.charAt(3))
      : hex.length === 8
        ? hex.slice(6, 8)
        : undefined

  const a = aHex === undefined ? 1 : Number.parseInt(aHex, 16) / 255

  if (a < 0.05) {
    return null
  }

  return [
    Number.parseInt(rHex, 16) / 255,
    Number.parseInt(gHex, 16) / 255,
    Number.parseInt(bHex, 16) / 255,
    a,
  ]
}

/**
 * Parse any CSS color string to [r, g, b, a] in 0–1 range.
 * Returns null for unparseable values.
 */
export function parseColor(css: string): RGBA | null {
  if (
    css.length === 0 ||
    css === "none" ||
    css === "transparent" ||
    css === "rgba(0, 0, 0, 0)"
  ) {
    return null
  }

  if (css.startsWith("#")) {
    return parseHexColor(css)
  }

  const match = css.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/
  )

  if (match === null) {
    return null
  }

  const [, r, g, b, alpha] = match

  // Defensive narrowing for strict indexed access
  if (r === undefined || g === undefined || b === undefined) {
    return null
  }

  const a = alpha === undefined ? 1 : Number.parseFloat(alpha)

  if (a < 0.05) {
    return null
  }

  return [
    Number.parseInt(r, 10) / 255,
    Number.parseInt(g, 10) / 255,
    Number.parseInt(b, 10) / 255,
    a,
  ]
}

/**
 * Relative luminance per WCAG 2.1.
 * Input: r, g, b in 0–1 range.
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number): number =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/**
 * Walk up the DOM from el to find the first ancestor with a non-transparent
 * background-color. Returns the parsed color, or null if none found.
 */
export function effectiveBgColor(el: Element): RGBA | null {
  let cur: Element | null = el
  while (cur) {
    const bg = getComputedStyle(cur).backgroundColor
    const c = parseColor(bg)
    if (c) return c
    cur = cur.parentElement
  }
  return null
}

/**
 * Walk up the DOM from el to find the first ancestor with a non-transparent
 * background-color. Returns luminance 0-1, or null if none found.
 */
export function effectiveBgLuminance(el: Element): number | null {
  const c = effectiveBgColor(el)
  return c ? relativeLuminance(c[0], c[1], c[2]) : null
}
