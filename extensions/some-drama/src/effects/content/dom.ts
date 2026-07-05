// ── DOM ───────────────────────────────────────────────────────────────────────
// Browser-API domain: the one place that calls document.createElement for the
// display layer. Presentation code composes elements through this adapter
// instead of touching `document` directly.

/** Create a typed HTML element with optional class and attribute map. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  attrs?: Record<string, string>
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (attrs) Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v))
  return e
}
