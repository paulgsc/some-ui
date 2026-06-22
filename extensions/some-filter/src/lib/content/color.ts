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
 * background-color. Returns luminance 0-1, or null if none found.
 */
export function effectiveBgLuminance(el: Element): number | null {
  let cur: Element | null = el
  while (cur) {
    const bg = getComputedStyle(cur).backgroundColor
    const c = parseColor(bg)
    if (c) return relativeLuminance(c[0], c[1], c[2])
    cur = cur.parentElement
  }
  return null
}
