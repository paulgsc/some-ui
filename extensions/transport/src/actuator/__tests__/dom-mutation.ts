/**
 * The DOM-mutating call shapes the purity and exclusivity suites grep for
 * (S4, S6, S9): one list, so the three checks cannot drift apart.
 */
export const MUTATING_CALL_PATTERNS: ReadonlyArray<RegExp> = [
  /\.setAttribute\s*\(/,
  /\.removeAttribute\s*\(/,
  /\.style\s*[.=]/,
  /\.appendChild\s*\(/,
  /\.insertBefore\s*\(/,
  /\.replaceChild\s*\(/,
  /\.removeChild\s*\(/,
  /\.remove\s*\(\s*\)/,
  /\.innerHTML\s*=/,
  /\.outerHTML\s*=/,
  /\.textContent\s*=/,
  /\.classList\.(add|remove|toggle|replace)\s*\(/,
]
