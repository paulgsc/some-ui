/**
 * Parse a trusted, hardcoded SVG string and return an importable DOM node.
 * Using DOMParser avoids innerHTML assignment, which web-ext lint flags as
 * UNSAFE_VAR_ASSIGNMENT regardless of whether the content is dynamic.
 *
 * Only call this with literal SVG markup — never with user-controlled strings.
 */
export function svgNode(markup: string): Node {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml")
  return document.importNode(doc.documentElement, true)
}
