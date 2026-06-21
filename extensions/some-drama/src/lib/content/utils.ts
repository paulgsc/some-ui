// ── Utils ─────────────────────────────────────────────────────────────────────
// Pure functions only. No DOM, no global state.
// Each function does one thing; test in isolation.

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

/** Uniform random float in [min, max). */
export function rnd(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/** Map a 0–10 rating to a 5-star string. */
export function starsFor(rating: number): string {
  const full = Math.round(rating / 2)
  return "★".repeat(full) + "☆".repeat(5 - full)
}

/** Human-readable label for completion likelihood (0–1). */
export function likelihoodLabel(p: number): string {
  if (p >= 0.85) return "Finishing ✓"
  if (p >= 0.6) return "Likely"
  if (p >= 0.35) return "On the fence"
  return "Dropping?"
}

/** Clamp a number to [lo, hi]. */
export function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}
